const { ChatGroq } = require('@langchain/groq');

let groqApiKeys = [];
let currentKeyIndex = 0;
let keyStats = new Map();

const RATE_LIMITS = {
  RPM: 30,
  RPD: 1000,
  TPM: 30000,
  TPD: 500000,
};

function initializeGroqKeys() {
  if (process.env.GROQ_API_KEYS) {
    groqApiKeys = process.env.GROQ_API_KEYS.split(',').map(key => key.trim()).filter(key => key.length > 0);
  } else if (process.env.GROQ_API_KEY) {
    groqApiKeys = [process.env.GROQ_API_KEY];
  } else {
    throw new Error('No Groq API keys found. Set GROQ_API_KEYS or GROQ_API_KEY environment variable.');
  }
  
  if (groqApiKeys.length === 0) {
    throw new Error('No valid Groq API keys provided.');
  }
  
  groqApiKeys.forEach((key, index) => {
    const keyId = `key_${index + 1}`;
    keyStats.set(keyId, {
      requestsPerMinute: [],
      requestsPerDay: [],
      tokensPerMinute: [],
      tokensPerDay: [],
      lastReset: Date.now(),
    });
  });
  
}

function cleanupOldStats(stats) {
  const now = Date.now();
  const oneMinuteAgo = now - 60000;
  const oneDayAgo = now - 86400000;
  
  stats.requestsPerMinute = stats.requestsPerMinute.filter(timestamp => timestamp > oneMinuteAgo);
  stats.tokensPerMinute = stats.tokensPerMinute.filter(entry => entry.timestamp > oneMinuteAgo);
  
  stats.requestsPerDay = stats.requestsPerDay.filter(timestamp => timestamp > oneDayAgo);
  stats.tokensPerDay = stats.tokensPerDay.filter(entry => entry.timestamp > oneDayAgo);
}

function canUseKey(keyId) {
  const stats = keyStats.get(keyId);
  if (!stats) return true;
  
  cleanupOldStats(stats);
  
  const rpm = stats.requestsPerMinute.length;
  const rpd = stats.requestsPerDay.length;
  const tpm = stats.tokensPerMinute.reduce((sum, entry) => sum + entry.tokens, 0);
  const tpd = stats.tokensPerDay.reduce((sum, entry) => sum + entry.tokens, 0);
  
  return rpm < RATE_LIMITS.RPM && 
         rpd < RATE_LIMITS.RPD && 
         tpm < RATE_LIMITS.TPM && 
         tpd < RATE_LIMITS.TPD;
}

function recordUsage(keyId, tokens = 1000) {
  const stats = keyStats.get(keyId);
  if (!stats) return;
  
  const now = Date.now();
  stats.requestsPerMinute.push(now);
  stats.requestsPerDay.push(now);
  stats.tokensPerMinute.push({ timestamp: now, tokens });
  stats.tokensPerDay.push({ timestamp: now, tokens });
  
  cleanupOldStats(stats);
  
  const rpm = stats.requestsPerMinute.length;
  const rpd = stats.requestsPerDay.length;
  const tpm = stats.tokensPerMinute.reduce((sum, entry) => sum + entry.tokens, 0);
  const tpd = stats.tokensPerDay.reduce((sum, entry) => sum + entry.tokens, 0);
  
}

function getNextGroqKey() {
  if (groqApiKeys.length === 0) {
    initializeGroqKeys();
  }
  
  let attempts = 0;
  while (attempts < groqApiKeys.length) {
    const keyId = `key_${currentKeyIndex + 1}`;
    
    if (canUseKey(keyId)) {
      const key = groqApiKeys[currentKeyIndex];
      const keyNum = currentKeyIndex + 1;
      currentKeyIndex = (currentKeyIndex + 1) % groqApiKeys.length;
      
      if (groqApiKeys.length > 1) {
      }
      
      return { key, keyId };
    }
    
    currentKeyIndex = (currentKeyIndex + 1) % groqApiKeys.length;
    attempts++;
  }
  
  return { key: groqApiKeys[0], keyId: 'key_1' };
}

function createGroqLLM(model, options = {}) {
  const { key, keyId } = getNextGroqKey();
  
  const modelToUse = model || process.env.GROQ_TEXT_MODEL || 'meta-llama/llama-4-scout-17b-16e-instruct';
  
  const llmInstance = new ChatGroq({
    apiKey: key,
    model: modelToUse,
    temperature: 0,
    maxRetries: 2,
    timeout: 15000,
    ...options
  });
  
  llmInstance._keyId = keyId;
  
  return llmInstance;
}

function getKeyStats() {
  const stats = [];
  keyStats.forEach((stat, keyId) => {
    cleanupOldStats(stat);
    const rpm = stat.requestsPerMinute.length;
    const rpd = stat.requestsPerDay.length;
    const tpm = stat.tokensPerMinute.reduce((sum, entry) => sum + entry.tokens, 0);
    const tpd = stat.tokensPerDay.reduce((sum, entry) => sum + entry.tokens, 0);
    
    stats.push({
      keyId,
      rpm: `${rpm}/${RATE_LIMITS.RPM}`,
      rpd: `${rpd}/${RATE_LIMITS.RPD}`,
      tpm: `${tpm}/${RATE_LIMITS.TPM}`,
      tpd: `${tpd}/${RATE_LIMITS.TPD}`,
      available: canUseKey(keyId)
    });
  });
  return stats;
}

if (process.env.GROQ_API_KEYS || process.env.GROQ_API_KEY) {
  initializeGroqKeys();
}

module.exports = {
  createGroqLLM,
  recordUsage,
  getKeyStats,
  groqApiKeys,
};
