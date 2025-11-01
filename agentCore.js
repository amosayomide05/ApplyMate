const {
  START,
  END,
  MessagesAnnotation,
  StateGraph,
  MemorySaver,
} = require('@langchain/langgraph');
const { ToolNode } = require('@langchain/langgraph/prebuilt');
const { ChatPromptTemplate } = require('@langchain/core/prompts');
const { createGroqLLM, recordUsage, groqApiKeys } = require('./groqKeyManager');
const {
  saveJobTool,
  getJobsTool,
  searchJobsTool,
  updateJobResponseTool,
  deleteJobTool,
  bulkUpdateJobResponseTool,
} = require('./tools');

const systemMessage = `You are ApplyMate, a job tracking assistant for WhatsApp. Help users manage job applications quickly and efficiently.

**SPREADSHEET COLUMNS:**
Company Name | Date | Position | Type (Full-time/Intern) | Location | Responded? | URL

**TOOLS:**
- getJobs: Get all jobs - USE THIS ONCE then answer from results
- searchJobs: Search by company/position/location
- saveJob: Add new job (needs company, position, location, type)
- updateJobResponse: Update ONE job status
- bulkUpdateJobResponse: Update ALL jobs at a company
- deleteJob: Remove a job

**CRITICAL RULES:**
1. For "what jobs" or "last job" → call getJobs ONCE, then answer directly from results. DO NOT call getJobs again.
2. After calling ANY tool, use the result to answer. DO NOT call the same tool repeatedly.
3. If tool returns data, format it nicely and respond. DO NOT ask for more data.
4. "Last job" = the LAST item in the getJobs list (highest number)
5. "First job" = the FIRST item in the getJobs list (number 1)

**RESPONSE STATUSES:**
"No" | "Yes - Rejected" | "Yes - Interview" | "Yes - Online Assessment" | "Yes - Offer"

**FORMATTING:**
*bold* for companies/positions | Use: ✅ ⏳ 📍 💼 📅
NO ## headings, NO HTML

Current date: ${new Date().toLocaleDateString('en-GB')}`;

const promptTemplate = ChatPromptTemplate.fromMessages([
  ['system', systemMessage],
  ['placeholder', '{messages}'],
]);

const conversationMemories = new Map();

function getMemoryForUser(userId) {
  if (!conversationMemories.has(userId)) {
    conversationMemories.set(userId, new MemorySaver());
  }
  return conversationMemories.get(userId);
}

function clearMemoryForUser(userId) {
  if (conversationMemories.has(userId)) {
    conversationMemories.delete(userId);
    return true;
  }
  return false;
}

function trimMessages(messages, maxMessages = 15) {
  if (messages.length <= maxMessages) {
    return messages;
  }
  
  
  const hasSystemMessage = messages.length > 0 && messages[0].constructor.name === 'SystemMessage';
  const systemMessages = hasSystemMessage ? [messages[0]] : [];
  
  const recentMessageCount = maxMessages - systemMessages.length;
  
  const recentMessages = messages.slice(-recentMessageCount);
  
  const trimmedMessages = [...systemMessages, ...recentMessages];
  
  return trimmedMessages;
}

async function createAgent() {
  
  const tools = [
    saveJobTool, 
    getJobsTool, 
    searchJobsTool, 
    updateJobResponseTool, 
    bulkUpdateJobResponseTool, 
    deleteJobTool
  ];
  
  
  const freshLLM = createGroqLLM();
  const modelWithTools = freshLLM.bindTools(tools, {
    tool_choice: "auto"
  });

  const callModel = async (state) => {
    
    let messages = state.messages;
    if (messages.length > 18) {
      messages = trimMessages(messages, 15);
    }
    
    const lastMessages = messages.slice(-3);
    lastMessages.forEach((msg, idx) => {
      const msgType = msg.constructor.name;
      const preview = msg.content ? msg.content.substring(0, 80) : '[no content]';
    });
    
    const trimmedState = { ...state, messages };
    const prompt = await promptTemplate.invoke(trimmedState);
    
    let response;
    let lastError;
    const maxRetries = Math.min(groqApiKeys.length, 3);
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        response = await modelWithTools.invoke(prompt);
        
        if (modelWithTools._keyId) {
          const estimatedTokens = JSON.stringify(prompt).length / 4;
          recordUsage(modelWithTools._keyId, Math.ceil(estimatedTokens));
        }
        
        break;
      } catch (error) {
        lastError = error;
        
        if (error.message && error.message.includes('rate limit')) {
          
          if (attempt < maxRetries - 1 && groqApiKeys.length > 1) {
            const retryLLM = createGroqLLM();
            const retryModel = retryLLM.bindTools(tools, { tool_choice: "auto" });
            response = await retryModel.invoke(prompt);
            
            if (retryModel._keyId) {
              const estimatedTokens = JSON.stringify(prompt).length / 4;
              recordUsage(retryModel._keyId, Math.ceil(estimatedTokens));
            }
            
            break;
          }
        } else {
          throw error;
        }
      }
    }
    
    if (!response) {
      throw lastError || new Error('Failed to get response from LLM after retries');
    }
    
    if (response.tool_calls && response.tool_calls.length > 0) {
    } else {
      const contentPreview = response.content ? response.content.substring(0, 100) : '[no content]';
    }
    
    return { messages: [response] };
  };

  const shouldContinue = (state) => {
    const messages = state.messages;
    const lastMessage = messages[messages.length - 1];
    
    
    if (lastMessage.tool_calls && lastMessage.tool_calls.length > 0) {
      return 'tools';
    }
    
    if (messages.length > 25) {
      return END;
    }
    
    return END;
  };

  const toolNode = new ToolNode(tools);
  
  const executeTools = async (state) => {
    const result = await toolNode.invoke(state);
    
    result.messages.forEach((msg, idx) => {
      if (msg.content) {
        const preview = msg.content.substring(0, 100);
      }
    });
    
    return result;
  };

  const workflow = new StateGraph(MessagesAnnotation)
   .addNode('model', callModel)
   .addNode('tools', executeTools)
   .addEdge(START, 'model')
   .addConditionalEdges('model', shouldContinue, {
      tools: 'tools',
      [END]: END,
    })
   .addEdge('tools', 'model');

  return workflow;
}

async function processWithAgent(messageText, userId) {
  const startTime = Date.now();
  
  try {
    if (!messageText || typeof messageText !== 'string') {
      throw new Error('Invalid message text');
    }
    
    if (!userId) {
      throw new Error('User ID is required');
    }

    const workflow = await createAgent();
    const memory = getMemoryForUser(userId);
    const app = workflow.compile({ checkpointer: memory });

    const config = { 
      configurable: { thread_id: userId },
      recursionLimit: 25
    };
    
    const input = {
      messages: [{ role: 'user', content: messageText }],
    };

    
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('TIMEOUT')), 30000);
    });

    const output = await Promise.race([
      app.invoke(input, config),
      timeoutPromise
    ]);
    
    
    const lastMessage = output.messages[output.messages.length - 1];
    
    if (!lastMessage || !lastMessage.content) {
      throw new Error('No response generated from the agent');
    }
    
    const responseTime = Date.now() - startTime;
    
    return lastMessage.content;
  } catch (error) {
    const responseTime = Date.now() - startTime;
    
    if (error.message === 'TIMEOUT') {
      return 'Sorry, that took too long to process. Please try asking your question in a simpler way or try again.';
    }
    
    if (error.message && error.message.includes('Recursion limit')) {
      return 'I\'m having trouble processing that. Please try a simpler question like:\n• "Show me my jobs"\n• "What was the last job I applied to?"\n• "Did Amazon respond?"';
    }
    
    if (error.message && error.message.includes('tool_use_failed')) {
      return 'I had trouble understanding your request. Could you rephrase it? For example, try "show me my jobs" or "what jobs did I apply to?"';
    }
    
    if (error.message && error.message.includes('API key')) {
      return 'I\'m having trouble connecting to my AI service. Please contact support.';
    }
    
    if (error.message && error.message.includes('rate limit')) {
      return 'I\'m receiving too many requests right now. Please wait a moment and try again.';
    }
    
    
    return 'Sorry, I encountered an error processing your request. Please try again or rephrase your message.';
  }
}

async function analyzeJobImage(imageUrl) {
  try {
    
    if (!imageUrl || typeof imageUrl !== 'string') {
      throw new Error('Invalid image URL');
    }

    const imageModel = process.env.GROQ_IMAGE_MODEL || 'llama-3.2-90b-vision-preview';
    const visionLLM = createGroqLLM(imageModel, {
      maxRetries: 2,
      timeout: 20000,
    });

    const prompt = `You are an expert at extracting job details from images. Please analyze this image and extract the following information:

1. Job Title (e.g., Software Engineer, Data Analyst)
2. Company Name
3. Job Location (e.g., USA, UK, Remote, California, San Jose, Texas)
4. Job Type (Full-time or Intern - if not stated, assume Full-time)

Return ONLY the extracted information in this exact format:
- Job Title: [extracted title]
- Company Name: [extracted company]
- Location: [extracted location]
- Type: [Full-time or Intern]

If any information is not visible or unclear in the image, write "Not found" for that field.`;

    const message = {
      role: 'user',
      content: [
        { type: 'text', text: prompt },
        { type: 'image_url', image_url: { url: imageUrl } },
      ],
    };

    const response = await visionLLM.invoke([message]);
    
    if (visionLLM._keyId) {
      const estimatedTokens = 2000;
      recordUsage(visionLLM._keyId, estimatedTokens);
    }
    
    if (!response || !response.content) {
      throw new Error('No response from vision model');
    }
    
    return response.content;
  } catch (error) {
    
    if (error.message && error.message.includes('rate limit')) {
      throw new Error('Rate limit reached. Please wait a moment before sending another image.');
    }
    
    if (error.message && error.message.includes('image')) {
      throw new Error('Unable to process this image. Please ensure it\'s a valid job posting screenshot.');
    }
    
    throw new Error(`Failed to analyze image: ${error.message}`);
  }
}

module.exports = {
  processWithAgent,
  analyzeJobImage,
  clearMemoryForUser,
};
