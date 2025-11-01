const { processWithAgent, analyzeJobImage, clearMemoryForUser } = require('./agentCore');
const {
  saveJobToSheet,
  getJobsFromSheet,
  searchJobsInSheet,
  updateJobResponse,
  deleteJobFromSheet,
} = require('./googleSheetsService');
const { getKeyStats } = require('./groqKeyManager');

module.exports = {
  processWithAgent,
  analyzeJobImage,
  saveJobToSheet,
  getJobsFromSheet,
  searchJobsInSheet,
  updateJobResponse,
  deleteJobFromSheet,
  clearMemoryForUser,
  getKeyStats,
};
