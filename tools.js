const { tool } = require('@langchain/core/tools');
const { z } = require('zod');
const {
  saveJobToSheet,
  getJobsFromSheet,
  searchJobsInSheet,
  updateJobResponse,
  bulkUpdateJobResponse,
  deleteJobFromSheet,
} = require('./googleSheetsService');

const saveJobTool = tool(
  async (input) => {
    try {
      const result = await saveJobToSheet(input);
      return result;
    } catch (error) {
      return `Failed to save job: ${error.message}`;
    }
  },
  {
    name: 'saveJob',
    description: 'Save new job to spreadsheet. Requires: company, position, location, type (Full-time/Intern). Optional: url, date.',
    schema: z.object({
      companyName: z.string().min(1).describe('The name of the company'),
      position: z.string().min(1).describe('The job position/title'),
      place: z.string().describe('The job location (e.g., US-Remote, London-Hybrid)'),
      type: z.enum(['Full-time', 'Intern']).default('Full-time').describe('Job type: Full-time or Intern'),
      url: z.string().optional().describe('URL of the job posting'),
      date: z.string().optional().describe('Date applied in DD/MM/YYYY format'),
    }),
  }
);

const getJobsTool = tool(
  async (input) => {
    try {
      const result = await getJobsFromSheet();
      return result;
    } catch (error) {
      return `Failed to retrieve jobs: ${error.message}`;
    }
  },
  {
    name: 'getJobs',
    description: 'Get ALL jobs from spreadsheet. Call this ONCE then answer the user from the results. DO NOT call again. Use for: "what jobs", "show jobs", "last job", "first job".',
    schema: z.object({
      _: z.string().optional().describe('Unused parameter - always omit or pass empty string')
    }).passthrough(),
  }
);

const searchJobsTool = tool(
  async (input) => {
    try {
      const result = await searchJobsInSheet(input.query);
      return result;
    } catch (error) {
      return `Failed to search jobs: ${error.message}`;
    }
  },
  {
    name: 'searchJobs',
    description: 'Search jobs by company, position, location, or type.',
    schema: z.object({
      query: z.string().min(1).describe('Search query (company name, position, location, or type)'),
    }),
  }
);

const updateJobResponseTool = tool(
  async (input) => {
    try {
      return await updateJobResponse(input.jobIdentifier, input.responseStatus);
    } catch (error) {
      return `Failed to update job response: ${error.message}`;
    }
  },
  {
    name: 'updateJobResponse',
    description: 'Update response status for ONE job. Auto-use when user mentions outcome (rejected/interview/assessment/offer). If multiple matches, ask for clarification.',
    schema: z.object({
      jobIdentifier: z.string().min(1).describe('Job identifier (company name and/or position) extracted from user message. Be as specific as possible to avoid ambiguity.'),
      responseStatus: z.string().min(1).describe('Response status: "No" (not responded), "Yes - Rejected" (rejected), "Yes - Interview" (got interview), "Yes - Online Assessment" (got assessment), "Yes - Offer" (got offer), or any other relevant status based on what user said'),
    }),
  }
);

const deleteJobTool = tool(
  async (input) => {
    try {
      return await deleteJobFromSheet(input.jobIdentifier);
    } catch (error) {
      return `Failed to delete job: ${error.message}`;
    }
  },
  {
    name: 'deleteJob',
    description: 'Delete a job from tracking. Cannot be undone.',
    schema: z.object({
      jobIdentifier: z.string().min(1).describe('Job identifier (company name and/or position)'),
    }),
  }
);

const bulkUpdateJobResponseTool = tool(
  async (input) => {
    try {
      return await bulkUpdateJobResponse(input.jobIdentifier, input.responseStatus);
    } catch (error) {
      return `Failed to bulk update jobs: ${error.message}`;
    }
  },
  {
    name: 'bulkUpdateJobResponse',
    description: 'Update ALL jobs at a company. Use ONLY when user says "all" or "both" for multiple jobs.',
    schema: z.object({
      jobIdentifier: z.string().min(1).describe('Job identifier (usually company name) - all matching jobs will be updated'),
      responseStatus: z.string().min(1).describe('Response status to apply to all matching jobs: "Yes - Rejected", "Yes - Interview", "Yes - Online Assessment", "Yes - Offer", etc.'),
    }),
  }
);

module.exports = {
  saveJobTool,
  getJobsTool,
  searchJobsTool,
  updateJobResponseTool,
  deleteJobTool,
  bulkUpdateJobResponseTool,
};
