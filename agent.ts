import { ChatOpenAI } from "@langchain/openai";
import { tools } from "./tools";
import { createReactAgent } from "@langchain/langgraph/prebuilt";

// Ensure process.env.OPENAI_API_KEY is available when calling this
export const analyzePortfolio = async (portfolioJsonStr: string) => {
  const llm = new ChatOpenAI({
    modelName: "gpt-4o",
    temperature: 0,
  });

  const agent = createReactAgent({
    llm,
    tools,
  });

  const prompt = `
You are a top-tier financial analyst. I have provided my investment portfolio below as a JSON string.
Please provide a comprehensive financial analysis of my holdings.

Portfolio:
${portfolioJsonStr}

For each holding, please:
1. Fetch the current stock price and key stats (day high/low, 52-week high/low).
2. Fetch the company info to understand the sector, industry, and key statistics (like Market Cap and P/E).
3. Fetch recent news to provide context on any recent movements or future catalysts.

Then, provide:
1. A summary of each holding based on the data.
2. An overall portfolio overview (sector allocation, perceived risk, general market sentiment based on news).
3. Actionable insights or things to watch out for.

Use the tools provided to gather data before providing the analysis. Present the final output in clear, structured Markdown.
  `;

  const response = await agent.invoke({
    messages: [
      {
        role: "user",
        content: prompt,
      },
    ],
  });

  return response.messages[response.messages.length - 1].content;
};
