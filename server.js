const express = require('express');
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const axios = require('axios');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
require('dotenv').config();

const { processWithAgent, analyzeJobImage, clearMemoryForUser } = require('./aiAgent');

const app = express();
const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;

const MEDIA_DIR = path.join(__dirname, 'media');
const MAX_MEDIA_SIZE = parseInt(process.env.MAX_MEDIA_SIZE || '52428800', 10);
if (!fs.existsSync(MEDIA_DIR)) {
    fs.mkdirSync(MEDIA_DIR, { recursive: true, mode: 0o755 });
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/media', express.static(MEDIA_DIR));

function findChromeExecutable() {
    const platform = os.platform();
    const possiblePaths = [];

    if (platform === 'win32') {
        possiblePaths.push(
            'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
            'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
        );
        
        if (process.env.LOCALAPPDATA) {
            possiblePaths.push(path.join(process.env.LOCALAPPDATA, 'Google\\Chrome\\Application\\chrome.exe'));
        }
        if (process.env.PROGRAMFILES) {
            possiblePaths.push(path.join(process.env.PROGRAMFILES, 'Google\\Chrome\\Application\\chrome.exe'));
        }
        if (process.env['PROGRAMFILES(X86)']) {
            possiblePaths.push(path.join(process.env['PROGRAMFILES(X86)'], 'Google\\Chrome\\Application\\chrome.exe'));
        }
    } else if (platform === 'darwin') {
        possiblePaths.push(
            '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
            path.join(os.homedir(), 'Applications/Google Chrome.app/Contents/MacOS/Google Chrome')
        );
    } else {
        possiblePaths.push(
            '/usr/bin/google-chrome',
            '/usr/bin/google-chrome-stable',
            '/usr/bin/google-chrome-beta',
            '/usr/bin/google-chrome-dev',
            '/usr/bin/chromium-browser',
            '/usr/bin/chromium',
            '/snap/bin/chromium'
        );
    }

    for (const chromePath of possiblePaths) {
        if (chromePath && path.isAbsolute(chromePath) && fs.existsSync(chromePath)) {
            return chromePath;
        }
    }

    return null;
}

const chromeExecutable = findChromeExecutable();
const puppeteerConfig = {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
};

if (chromeExecutable) {
    puppeteerConfig.executablePath = chromeExecutable;
}

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: puppeteerConfig
});

let isClientReady = false;

function getFileExtension(mimetype, filename) {
    if (filename) {
        const ext = path.extname(filename);
        if (ext) return ext;
    }
    
    const mimetypeMap = {
        'image/jpeg': '.jpg',
        'image/jpg': '.jpg',
        'image/png': '.png',
        'image/gif': '.gif',
        'image/webp': '.webp',
        'video/mp4': '.mp4',
        'video/mpeg': '.mpeg',
        'video/webm': '.webm',
        'audio/mpeg': '.mp3',
        'audio/mp3': '.mp3',
        'audio/ogg': '.ogg',
        'audio/wav': '.wav',
        'audio/webm': '.weba',
        'application/pdf': '.pdf',
        'application/msword': '.doc',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx'
    };
    
    return mimetypeMap[mimetype] || '.bin';
}

client.on('qr', (qr) => {
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    isClientReady = true;
});

client.on('authenticated', () => {
});

client.on('auth_failure', (msg) => {
});

client.on('disconnected', (reason) => {
    isClientReady = false;
});

client.on('message', async (msg) => {
    if ((!msg.body || msg.body.trim() === '') && !msg.hasMedia) {
        return;
    }
    
    if (msg.fromMe || msg.from.includes('@g.us')) {
        return;
    }
    
    try {
        let messageToProcess = msg.body || '';
        let userId = msg.from.replace('@c.us', '');
        
        if (messageToProcess.trim() === '/clear') {
            const cleared = clearMemoryForUser(userId);
            if (cleared) {
                await msg.reply('✅ Your conversation history has been cleared. Starting fresh!');
            } else {
                await msg.reply('✅ No conversation history to clear. You can start chatting!');
            }
            return;
        }
        
        if (msg.hasMedia) {
            try {
                const media = await msg.downloadMedia();
                if (media && media.mimetype.startsWith('image/')) {
                    const buffer = Buffer.from(media.data, 'base64');
                    const timestamp = Date.now();
                    const randomString = crypto.randomBytes(8).toString('hex');
                    const extension = getFileExtension(media.mimetype, media.filename);
                    const filename = `${timestamp}-${randomString}${extension}`;
                    const filePath = path.join(MEDIA_DIR, filename);
                    
                    await fs.promises.writeFile(filePath, buffer);
                    const mediaUrl = `${BASE_URL}/media/${filename}`;
                    
                    
                    const jobExtraction = await analyzeJobImage(mediaUrl);
                    
                    if (jobExtraction) {
                        const caption = msg.body || '';
                        messageToProcess = `The job you are to save has been extracted: ${jobExtraction}\n\nURL: ${caption}`;
                    } else {
                        messageToProcess = 'I received an image but could not extract job details from it. Please try again or send the job details as text.';
                    }
                }
            } catch (mediaError) {
                messageToProcess = 'Sorry, I had trouble processing the image. Please try again.';
            }
        }
        
        const response = await processWithAgent(messageToProcess, userId);
        
        if (response) {
            await msg.reply(response);
        }
        
    } catch (error) {
        
        let errorMessage = 'Sorry, I encountered an error. Please try again later.';
        
        if (error.message === 'TIMEOUT') {
            errorMessage = '⏳ Response is taking too long. Please try a simpler query or try again later.';
        } else if (error.status === 429 || error.code === 'rate_limit_exceeded') {
            const retryAfter = error.headers?.['retry-after'];
            const waitTime = retryAfter ? `${Math.ceil(retryAfter / 60)} minutes` : 'a few minutes';
            errorMessage = `⏳ Rate limit reached. Please wait ${waitTime} before trying again.`;
        }
        
        try {
            await msg.reply(errorMessage);
        } catch (replyError) {
        }
    }
});

client.initialize();

function validateFilePath(filePath) {
    if (!filePath || typeof filePath !== 'string') {
        throw new Error('Invalid file path: must be a non-empty string');
    }
    
    if (filePath.includes('..') || filePath.includes('~')) {
        throw new Error('Invalid file path: directory traversal not allowed');
    }
    
    const allowedBaseDir = process.env.MEDIA_BASE_DIR || process.cwd();
    const resolvedBaseDir = path.resolve(allowedBaseDir);
    
    const resolvedPath = path.resolve(filePath);
    
    if (!resolvedPath.startsWith(resolvedBaseDir)) {
        throw new Error('Invalid file path: access outside allowed directory not permitted');
    }
    
    if (!fs.existsSync(resolvedPath)) {
        throw new Error(`File not found: ${filePath}`);
    }
    
    const stats = fs.statSync(resolvedPath);
    if (!stats.isFile()) {
        throw new Error(`Path is not a file: ${filePath}`);
    }
    
    return resolvedPath;
}

function formatChatId(number) {
    if (!number || typeof number !== 'string') {
        throw new Error('Invalid number parameter: must be a non-empty string');
    }
    
    if (number.includes('@c.us') || number.includes('@g.us')) {
        return number;
    }
    
    return `${number}@c.us`;
}

app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        clientReady: isClientReady,
        timestamp: new Date().toISOString()
    });
});

app.post('/send-message', async (req, res) => {
    try {
        const { number, message } = req.body;

        if (!number || !message) {
            return res.status(400).json({
                success: false,
                error: 'Both number and message are required'
            });
        }

        if (!isClientReady) {
            return res.status(503).json({
                success: false,
                error: 'WhatsApp client is not ready yet'
            });
        }

        const chatId = formatChatId(number);

        const sentMessage = await client.sendMessage(chatId, message);

        res.json({
            success: true,
            messageId: sentMessage.id._serialized,
            timestamp: sentMessage.timestamp,
            to: chatId
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.post('/send-image', async (req, res) => {
    try {
        const { number, imageUrl, imageBase64, filePath, caption, mimetype, filename } = req.body;

        if (!number) {
            return res.status(400).json({
                success: false,
                error: 'Number is required'
            });
        }

        if (!imageUrl && !imageBase64 && !filePath) {
            return res.status(400).json({
                success: false,
                error: 'Either imageUrl, imageBase64, or filePath is required'
            });
        }

        if (!isClientReady) {
            return res.status(503).json({
                success: false,
                error: 'WhatsApp client is not ready yet'
            });
        }

        const chatId = formatChatId(number);

        let media;

        if (imageUrl) {
            media = await MessageMedia.fromUrl(imageUrl);
        } else if (filePath) {
            const validatedPath = validateFilePath(filePath);
            media = MessageMedia.fromFilePath(validatedPath);
        } else if (imageBase64) {
            const mediaType = mimetype || 'image/png';
            const mediaFilename = filename || 'image.png';
            media = new MessageMedia(mediaType, imageBase64, mediaFilename);
        }

        const sentMessage = await client.sendMessage(chatId, media, {
            caption: caption || ''
        });

        res.json({
            success: true,
            messageId: sentMessage.id._serialized,
            timestamp: sentMessage.timestamp,
            to: chatId
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.listen(PORT, () => {
});
