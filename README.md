# ApplyMate - AI-Powered WhatsApp Job Tracking Bot

>**Warning:** This project is intended for educational and personal use only. ApplyMate is not affiliated with or endorsed by Meta Platforms, Inc. (WhatsApp). Use of this software is at your own risk. Unauthorized automation of WhatsApp may violate WhatsApp's Terms of Service and could result in account suspension or permanent ban. Please review WhatsApp's terms before using this bot.

---

## What is ApplyMate?

ApplyMate is a WhatsApp bot that combines AI-powered conversation with smart job tracking. Simply chat with it like you would with a friend - send job posting screenshots, ask about your applications, or update status - and ApplyMate handles the rest.

**Key capabilities:**
- Natural conversations powered by Groq's advanced AI models
- Extracts job details from screenshots automatically
- Tracks all applications in Google Sheets
- Search and filter your applications
- Remembers conversation context
- Updates application status on the fly

## Getting Started

### What You'll Need

Before setting up ApplyMate, gather these prerequisites:

1. **Node.js** (version 20 or higher) installed on your computer
2. **A phone with WhatsApp** installed
3. **Groq API key** for AI capabilities
4. **Google Service Account** for spreadsheet integration

### Step 1: Get Your Groq API Key

Groq powers ApplyMate's AI brain. Here's how to get your free API key:

1. Visit https://console.groq.com
2. Sign up for a free account (or log in if you already have one)
3. Navigate to the API Keys section
4. Click "Create API Key"
5. Give your key a name (e.g., "ApplyMate")
6. Copy the key immediately and save it somewhere safe (you won't be able to see it again!)

**Note:** Groq offers generous free tier limits. For personal job tracking, you likely won't need to upgrade.

### Step 2: Set Up Google Sheets

ApplyMate stores your job applications in Google Sheets, giving you a familiar spreadsheet interface to view and manage your data.

#### Create a Service Account

1. Go to https://console.cloud.google.com
2. Create a new project or select an existing one
3. Enable the **Google Sheets API** for your project
4. Navigate to **IAM & Admin** → **Service Accounts**
5. Click **Create Service Account**
6. Name it something like "applymate-bot"
7. Grant it the **Editor** role
8. Click **Done**

#### Generate Credentials

1. Click on your newly created service account
2. Go to the **Keys** tab
3. Click **Add Key** → **Create new key**
4. Choose **JSON** format
5. Download the JSON file (keep this secure!)

#### Prepare Your Spreadsheet

1. Go to https://sheets.google.com
2. Create a new spreadsheet
3. Name it something like "Job Applications"
4. In the first row, add these headers:
   - Company Name
   - Date
   - Position
   - Type
   - Place
   - Responded?
   - URL
5. Share the spreadsheet with the service account email (find it in the JSON file you downloaded)
6. Give it **Editor** permissions
7. Copy the spreadsheet ID from the URL (the long string between /d/ and /edit)

### Step 3: Install ApplyMate

Download and install the bot on your computer:

1. Download or clone this repository
2. Open a terminal in the project folder
3. Run: npm install
4. Wait for all dependencies to install

### Step 4: Configure Your Environment

1. Copy the example environment file and rename it to .env
2. Open the .env file in a text editor
3. Fill in your details:

**Server Settings:**
- PORT: 3001 (or any port you prefer)
- BASE_URL: http://localhost:3001 (or your server URL)

**Groq Configuration:**
- GROQ_API_KEY: Paste your Groq API key here
- GROQ_TEXT_MODEL: llama-3.3-70b-versatile (default, can change)
- GROQ_IMAGE_MODEL: meta-llama/llama-4-scout-17b-16e-instruct (default, can change)

**Google Sheets Configuration:**
- GOOGLE_SPREADSHEET_ID: Your spreadsheet ID
- GOOGLE_SERVICE_ACCOUNT_EMAIL: Email from the JSON file
- GOOGLE_PRIVATE_KEY: The private_key value from the JSON file

**Important:** For the GOOGLE_PRIVATE_KEY, copy the entire private key from the JSON file including the BEGIN and END lines.

### Step 5: Start ApplyMate

**For Development/Testing:**
Simply run: npm start

**For Production (Recommended):**
ApplyMate uses PM2 for reliable production deployment:

1. Install PM2 globally: npm install -g pm2
2. Start ApplyMate: npm run pm2

PM2 keeps ApplyMate running even if your server restarts. Useful commands:
- View status: pm2 list
- View logs: npm run pm2:logs
- Restart: npm run pm2:restart
- Stop: npm run pm2:stop

### Step 6: Connect Your WhatsApp

When you start ApplyMate, you'll see a QR code in your terminal:

1. Open WhatsApp on your phone
2. Tap the three dots (Android) or Settings (iOS)
3. Select **Linked Devices**
4. Tap **Link a Device**
5. Scan the QR code from your terminal

ApplyMate is now connected and ready to help!

## Using ApplyMate

### Natural Conversation

Just chat naturally with ApplyMate. Here are some things you can say:

**Save a job:**
- "I applied to Google for a Software Engineer position, remote, full-time"
- "Save this job: Data Analyst at Microsoft, Seattle, Full-time"

**Send a screenshot:**
- Just send an image of a job posting
- ApplyMate will extract the details automatically
- Confirm to save it

**View your applications:**
- "Show me my jobs"
- "What jobs did I apply to?"
- "List my applications"

**Search:**
- "Search for Google jobs"
- "Show me remote positions"
- "Find Software Engineer applications"

**Update status:**
- "Google rejected me"
- "I got an interview at Microsoft"
- "Amazon sent me an online assessment"

**Delete applications:**
- "Delete the Facebook job"
- "Remove my Apple application"

**Get help:**
- "What can you do?"
- "Help me"

### Quick Commands

ApplyMate also supports a quick command:

- **/clear** - Clears your conversation history and starts fresh
## Troubleshooting

### QR Code Not Showing
- Check your terminal supports QR code display
- Close any other WhatsApp Web sessions
- Delete the .wwebjs_auth and .wwebjs_cache folders and restart

### Bot Not Responding
- Verify your Groq API key is correct
- Check that you have available API credits
- Make sure you're not messaging from the same number

### Google Sheets Issues
- Confirm the service account has editor access to your spreadsheet
- Check the private key is correctly formatted in your .env file
- Verify the Google Sheets API is enabled in your Google Cloud project

### Connection Lost
- ApplyMate will try to reconnect automatically
- If it fails, restart the application
- Check your internet connection

## Privacy & Security

- Your job data is stored only in your Google Sheet
- Conversations are processed securely through Groq
- No data is shared with third parties
- You control all credentials and access

## License

ISC

## Support

For issues or questions, please open an issue on GitHub.

---

Built with Node.js, Groq AI, and WhatsApp Web
