const { google } = require('googleapis');

function getGoogleSheetsAuth() {
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_EMAIL environment variable is not set');
  }
  
  if (!process.env.GOOGLE_PRIVATE_KEY) {
    throw new Error('GOOGLE_PRIVATE_KEY environment variable is not set');
  }
  
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return auth;
}

async function saveJobToSheet(jobData) {
  try {
    const auth = getGoogleSheetsAuth();
    const sheets = google.sheets({ version: 'v4', auth });
    
    if (!jobData.companyName || !jobData.position) {
      throw new Error('Company name and position are required fields');
    }
    
    const values = [[
      jobData.companyName || '',
      jobData.date || new Date().toLocaleDateString('en-GB'),
      jobData.position || '',
      jobData.type || 'Full-time',
      jobData.place || '',
      '',
      jobData.url || '',
    ]];

    await sheets.spreadsheets.values.append({
      spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID,
      range: 'Sheet1!A:G',
      valueInputOption: 'USER_ENTERED',
      resource: { values },
    });

    const successMsg = `✅ Job saved successfully: *${jobData.position}* at *${jobData.companyName}*`;
    return successMsg;
  } catch (error) {
    throw new Error(`Failed to save job: ${error.message}`);
  }
}

async function getJobsFromSheet() {
  try {
    const auth = getGoogleSheetsAuth();
    const sheets = google.sheets({ version: 'v4', auth });
    
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID,
      range: 'Sheet1!A:G',
    });

    const rows = response.data.values || [];
    
    if (rows.length === 0) {
      return 'No jobs found in the spreadsheet.';
    }

    if (rows.length === 1) {
      return 'The spreadsheet is empty - no jobs have been saved yet.';
    }

    const headers = rows[0];
    const jobs = rows.slice(1).map((row, index) => {
      const job = {};
      headers.forEach((header, i) => {
        job[header] = row[i] || '';
      });
      return `${index + 1}. *${job['Position'] || 'N/A'}* at *${job['Company Name'] || 'N/A'}*\n   📍 Location: ${job['Place'] || 'N/A'}\n   💼 Type: ${job['Type'] || 'N/A'}\n   📅 Date Applied: ${job['Date'] || 'N/A'}\n   ${job['Responded?'] ? '✅' : '⏳'} Response: ${job['Responded?'] || 'No'}`;
    }).join('\n\n');

    const result = `Here are your saved jobs (${rows.length - 1} total):\n\n${jobs}`;
    return result;
  } catch (error) {
    throw new Error(`Failed to retrieve jobs: ${error.message}`);
  }
}

async function searchJobsInSheet(searchQuery) {
  try {
    const auth = getGoogleSheetsAuth();
    const sheets = google.sheets({ version: 'v4', auth });
    
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID,
      range: 'Sheet1!A:G',
    });

    const rows = response.data.values || [];
    if (rows.length === 0) {
      return 'No jobs found in the spreadsheet.';
    }

    const headers = rows[0];
    const searchLower = searchQuery.toLowerCase().trim();
    const matchedJobs = [];

    rows.slice(1).forEach((row, index) => {
      const job = {};
      headers.forEach((header, i) => {
        job[header] = row[i] || '';
      });
      
      const searchableText = `${job['Company Name']} ${job['Position']} ${job['Place']} ${job['Type']}`.toLowerCase();
      if (searchableText.includes(searchLower)) {
        matchedJobs.push({
          rowNumber: index + 2,
          display: `${matchedJobs.length + 1}. *${job['Position']}* at *${job['Company Name']}*\n   📍 Location: ${job['Place']}\n   💼 Type: ${job['Type']}\n   📅 Date Applied: ${job['Date']}\n   ${job['Responded?'] ? '✅' : '⏳'} Response: ${job['Responded?'] || 'No'}`
        });
      }
    });


    if (matchedJobs.length === 0) {
      return `No jobs found matching "${searchQuery}". Try searching for a company name, position, location, or job type.`;
    }

    const results = matchedJobs.map(j => j.display).join('\n\n');
    return `Found ${matchedJobs.length} job(s) matching "${searchQuery}":\n\n${results}`;
  } catch (error) {
    throw new Error(`Failed to search jobs: ${error.message}`);
  }
}

async function updateJobResponse(jobIdentifier, responseStatus) {
  try {
    const auth = getGoogleSheetsAuth();
    const sheets = google.sheets({ version: 'v4', auth });
    
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID,
      range: 'Sheet1!A:G',
    });

    const rows = response.data.values || [];
    if (rows.length === 0) {
      return 'No jobs found in the spreadsheet.';
    }

    const headers = rows[0];
    const searchLower = jobIdentifier.toLowerCase();
    const matchedJobs = [];

    rows.slice(1).forEach((row, index) => {
      const job = {};
      headers.forEach((header, i) => {
        job[header] = row[i] || '';
      });
      
      const searchableText = `${job['Company Name']} ${job['Position']}`.toLowerCase();
      if (searchableText.includes(searchLower)) {
        matchedJobs.push({
          job: job,
          rowIndex: index + 2
        });
      }
    });


    if (matchedJobs.length === 0) {
      return `No job found matching "${jobIdentifier}".`;
    }

    if (matchedJobs.length > 1) {
      const jobList = matchedJobs.map((match, i) => {
        return `${i + 1}. *${match.job['Position']}* at *${match.job['Company Name']}*\n   Location: ${match.job['Place'] || 'N/A'}\n   Type: ${match.job['Type'] || 'N/A'}\n   Date Applied: ${match.job['Date'] || 'N/A'}`;
      }).join('\n\n');
      
      return `I found ${matchedJobs.length} jobs matching "${jobIdentifier}". Which one do you mean?\n\n${jobList}\n\nPlease specify the position or provide more details (e.g., "the Software Engineer III position" or "the one in US-Remote").\n\n*OR* if you want to update ALL of them, say "all of them" or "all ${matchedJobs.length}".`;
    }

    const matchedRow = matchedJobs[0].job;
    const rowIndex = matchedJobs[0].rowIndex;

    await sheets.spreadsheets.values.update({
      spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID,
      range: `Sheet1!F${rowIndex}`,
      valueInputOption: 'USER_ENTERED',
      resource: {
        values: [[responseStatus]]
      }
    });

    const result = `Updated response status for *${matchedRow['Position']}* at *${matchedRow['Company Name']}* to: ${responseStatus}`;
    return result;
  } catch (error) {
    return `Error updating job response: ${error.message}`;
  }
}

async function bulkUpdateJobResponse(jobIdentifier, responseStatus) {
  try {
    const auth = getGoogleSheetsAuth();
    const sheets = google.sheets({ version: 'v4', auth });
    
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID,
      range: 'Sheet1!A:G',
    });

    const rows = response.data.values || [];
    if (rows.length === 0) {
      return 'No jobs found in the spreadsheet.';
    }

    const headers = rows[0];
    const searchLower = jobIdentifier.toLowerCase();
    const matchedJobs = [];

    rows.slice(1).forEach((row, index) => {
      const job = {};
      headers.forEach((header, i) => {
        job[header] = row[i] || '';
      });
      
      const searchableText = `${job['Company Name']} ${job['Position']}`.toLowerCase();
      if (searchableText.includes(searchLower)) {
        matchedJobs.push({
          job: job,
          rowIndex: index + 2
        });
      }
    });

    if (matchedJobs.length === 0) {
      return `No job found matching "${jobIdentifier}".`;
    }

    const updateRequests = matchedJobs.map(match => ({
      range: `Sheet1!F${match.rowIndex}`,
      values: [[responseStatus]]
    }));

    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID,
      resource: {
        valueInputOption: 'USER_ENTERED',
        data: updateRequests
      }
    });

    const updatedList = matchedJobs.map((match, i) => 
      `${i + 1}. *${match.job['Position']}* at *${match.job['Company Name']}*`
    ).join('\n');

    return `Updated ${matchedJobs.length} job(s) to: *${responseStatus}*\n\n${updatedList}`;
  } catch (error) {
    return `Error bulk updating jobs: ${error.message}`;
  }
}

async function deleteJobFromSheet(jobIdentifier) {
  try {
    const auth = getGoogleSheetsAuth();
    const sheets = google.sheets({ version: 'v4', auth });
    
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID,
      range: 'Sheet1!A:G',
    });

    const rows = response.data.values || [];
    if (rows.length === 0) {
      return 'No jobs found in the spreadsheet.';
    }

    const headers = rows[0];
    
    const cleanedIdentifier = jobIdentifier
      .replace(/\*/g, '')
      .replace(/\s+at\s+/i, ' ')
      .toLowerCase()
      .trim();
    
    
    let matchedRow = null;
    let rowIndex = -1;

    rows.slice(1).forEach((row, index) => {
      const job = {};
      headers.forEach((header, i) => {
        job[header] = row[i] || '';
      });
      
      const searchableText = `${job['Company Name']} ${job['Position']}`.toLowerCase();
      
      if (searchableText.includes(cleanedIdentifier) && !matchedRow) {
        matchedRow = job;
        rowIndex = index + 1;
      }
    });

    if (!matchedRow) {
      return `No job found matching "${jobIdentifier}". Try using just the company name (e.g., "Okta") or position.`;
    }

    
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID,
      resource: {
        requests: [{
          deleteDimension: {
            range: {
              sheetId: 0,
              dimension: 'ROWS',
              startIndex: rowIndex,
              endIndex: rowIndex + 1
            }
          }
        }]
      }
    });

    const result = `✅ Deleted job: *${matchedRow['Position']}* at *${matchedRow['Company Name']}*`;
    return result;
  } catch (error) {
    return `Error deleting job: ${error.message}`;
  }
}

module.exports = {
  saveJobToSheet,
  getJobsFromSheet,
  searchJobsInSheet,
  updateJobResponse,
  bulkUpdateJobResponse,
  deleteJobFromSheet,
};
