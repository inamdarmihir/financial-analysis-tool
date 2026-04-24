#!/usr/bin/env bun
import { Command } from "commander";
import chalk from "chalk";
import { analyzePortfolio } from "./agent";
import fs from "fs/promises";
import * as dotenv from "dotenv";

dotenv.config();

const program = new Command();

program
  .name("dexter")
  .description("CLI to analyze investment portfolio using LangChain and Yahoo Finance")
  .version("1.0.0");

program
  .command("analyze")
  .description("Analyze a portfolio")
  .requiredOption("-p, --portfolio <json>", "JSON string of the portfolio (e.g. '[{\"ticker\":\"AAPL\",\"shares\":10}]')")
  .action(async (options) => {
    try {
      if (!process.env.OPENAI_API_KEY) {
        console.error(chalk.red("Error: OPENAI_API_KEY environment variable is missing."));
        console.log(chalk.yellow("Please create a .env file with OPENAI_API_KEY=your_key or export it in your shell."));
        process.exit(1);
      }

      console.log(chalk.blue("Parsing portfolio..."));
      const portfolio = JSON.parse(options.portfolio);
      console.log(chalk.green(`Successfully parsed portfolio with ${portfolio.length} holding(s).`));

      console.log(chalk.blue("\nAnalyzing portfolio... (This may take a minute)"));
      const result = await analyzePortfolio(options.portfolio);

      console.log(chalk.bold.magenta("\n--- Portfolio Analysis ---"));
      console.log(result);

    } catch (error: any) {
      console.error(chalk.red("Failed to analyze portfolio:"));
      console.error(error.message);
      process.exit(1);
    }
  });

program
  .command("analyze-file")
  .description("Analyze a portfolio from a JSON file")
  .requiredOption("-f, --file <path>", "Path to the JSON file containing the portfolio")
  .action(async (options) => {
    try {
      if (!process.env.OPENAI_API_KEY) {
        console.error(chalk.red("Error: OPENAI_API_KEY environment variable is missing."));
        console.log(chalk.yellow("Please create a .env file with OPENAI_API_KEY=your_key or export it in your shell."));
        process.exit(1);
      }

      console.log(chalk.blue(`Reading portfolio from ${options.file}...`));
      const fileContent = await fs.readFile(options.file, "utf-8");

      const portfolio = JSON.parse(fileContent);
      console.log(chalk.green(`Successfully parsed portfolio with ${portfolio.length} holding(s).`));

      console.log(chalk.blue("\nAnalyzing portfolio... (This may take a minute)"));
      const result = await analyzePortfolio(fileContent);

      console.log(chalk.bold.magenta("\n--- Portfolio Analysis ---"));
      console.log(result);

    } catch (error: any) {
      console.error(chalk.red("Failed to analyze portfolio:"));
      console.error(error.message);
      process.exit(1);
    }
  });

program.parse();
