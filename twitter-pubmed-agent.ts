import { Message } from './agent-base';
import { PubMedAgent } from './pubmed-agent';
import { TwitterClient } from './twitter-integration';
import { PersonalityManager } from './personality-system';
import * as path from 'path';

interface TwitterMention {
  id: string;
  text: string;
  author: {
    id: string;
    username: string;
  };
}

export class TwitterPubMedAgent extends PubMedAgent {
  private personalityManager: PersonalityManager;
  private twitterClient: TwitterClient;
  private tweetQueue: {text: string, time: Date}[] = [];
  private processingQueue: boolean = false;
  private tweetInterval: number = 3 * 60 * 60 * 1000; // 3 hours between tweets
  
  constructor() {
    // Initialize the PersonalityManager first
    const personalityManager = new PersonalityManager(
      path.join(__dirname, 'personality.json')
    );
    
    // Call parent constructor
    super({
      name: personalityManager.getName(),
      description: personalityManager.getBio(),
      version: "1.0.0",
    });
    
    this.personalityManager = personalityManager;
    
    // Initialize Twitter client
    try {
      this.twitterClient = new TwitterClient();
      console.log('Twitter client initialized');
    } catch (error) {
      console.error('Failed to initialize Twitter client:', error);
    }
  }
  
  async start(): Promise<boolean> {
    await super.start();
    
    // Setup Twitter mentions listener
    try {
      await this.twitterClient.waitUntilReady();
      
      // Start processing the tweet queue
      this.startQueueProcessor();
      
      // Set up listener for Twitter mentions
      await this.twitterClient.setupMentionListener(async (tweetData) => {
        await this.handleTwitterMention(tweetData);
      });
      
      console.log('Twitter PubMed Agent is now running and listening for mentions!');
      return true;
    } catch (error) {
      console.error('Error starting Twitter integration:', error);
      return false;
    }
  }
  
  // Process the tweet queue every few minutes
  private startQueueProcessor() {
    setInterval(async () => {
      if (this.tweetQueue.length > 0 && !this.processingQueue) {
        this.processingQueue = true;
        
        try {
          const now = new Date();
          const nextTweet = this.tweetQueue[0];
          
          // Check if enough time has passed since the last tweet
          const timeSinceLastTweet = now.getTime() - this.lastTweetTime.getTime();
          
          if (timeSinceLastTweet >= this.tweetInterval) {
            // Post the tweet
            const tweetId = await this.twitterClient.postTweet(nextTweet.text);
            
            if (tweetId) {
              // Update tracking variables
              this.lastTweetTime = now;
              this.tweetsPostedToday++;
              
              // Remove from queue
              this.tweetQueue.shift();
              
              console.log(`Posted tweet from queue. ${this.tweetQueue.length} tweets remaining in queue.`);
            }
          } else {
            console.log(`Waiting to post next tweet. ${Math.round((this.tweetInterval - timeSinceLastTweet) / 60000)} minutes remaining.`);
          }
        } catch (error) {
          console.error('Error processing tweet queue:', error);
        }
        
        this.processingQueue = false;
      }
    }, 5 * 60 * 1000); // Check the queue every 5 minutes
  }
  
  // Handle mentions on Twitter
  private async handleTwitterMention(tweetData: any) {
    if (!tweetData || !tweetData.data) {
      return;
    }
    
    try {
      const tweet = tweetData.data;
      const tweetText = tweet.text;
      
      // Create a simplified mention object
      const mention: TwitterMention = {
        id: tweet.id,
        text: tweetText.replace(/@\w+/g, '').trim(), // Remove @mentions
        author: {
          id: tweet.author_id,
          username: 'user' // Will get actual username from includes if available
        }
      };
      
      // Get username if available
      if (tweetData.includes && tweetData.includes.users) {
        const user = tweetData.includes.users.find((u: any) => u.id === tweet.author_id);
        if (user) {
          mention.author.username = user.username;
        }
      }
      
      // Parse the mention text for commands
      if (mention.text.toLowerCase().startsWith('/search') || 
          mention.text.toLowerCase().includes('search for')) {
        // Handle search request
        const searchQuery = mention.text.replace(/^\/search|search for/i, '').trim();
        await this.handleSearchMention(mention, searchQuery);
      } 
      else if (mention.text.toLowerCase().startsWith('/summarize') || 
               mention.text.match(/summarize\s+\d+/i)) {
        // Handle summarize request
        const pmidMatch = mention.text.match(/\b(\d{5,10})\b/);
        if (pmidMatch && pmidMatch[1]) {
          await this.handleSummarizeMention(mention, pmidMatch[1]);
        } else {
          // No valid PMID found
          await this.twitterClient.replyToTweet(mention.id, 
            `Hi @${mention.author.username}! I need a valid PubMed ID to summarize an article. Try something like "/summarize 12345678" 🔍`);
        }
      }
      // Handle general questions/requests
      else if (mention.text.includes('?') || 
               mention.text.toLowerCase().includes('what') || 
               mention.text.toLowerCase().includes('how') || 
               mention.text.toLowerCase().includes('why')) {
        await this.handleQuestionMention(mention);
      }
      // Handle greetings
      else if (this.isGreeting(mention.text.toLowerCase())) {
        await this.handleGreetingMention(mention);
      }
      // Handle other mentions
      else {
        await this.handleGenericMention(mention);
      }
      
    } catch (error) {
      console.error('Error handling Twitter mention:', error);
    }
  }
  
  private async handleSearchMention(mention: TwitterMention, query: string) {
    // Reply acknowledging the search
    await this.twitterClient.replyToTweet(mention.id, 
      `Hey @${mention.author.username}! Searching for recent research on "${query}" ${this.personalityManager.getEmojis('general')}`);
    
    try {
      // Search for articles
      const articles = await this.searchRecentArticles(query, 3);
      
      if (articles.length === 0) {
        await this.twitterClient.replyToTweet(mention.id,
          `@${mention.author.username} Couldn't find any recent articles about "${query}". Maybe try a different search term? ${this.personalityManager.getEmojis('general')}`);
        return;
      }
      
      // Format each article as a separate reply
      for (let i = 0; i < articles.length; i++) {
        const article = articles[i];
        
        // Format a brief summary
        let reply = `@${mention.author.username} ${i+1}/${articles.length}: "${article.title}"\n`;
        reply += `Authors: ${this.formatAuthorsShort(article.authors)}\n`;
        reply += `Journal: ${article.journal}\n`;
        reply += `PMID: ${article.id}\n\n`;
        reply += `Reply with "/summarize ${article.id}" for my take on this! ${this.personalityManager.getEmojis('excitement')}`;
        
        // Post the reply
        await this.twitterClient.replyToTweet(mention.id, reply);
        
        // Add a small delay between multiple replies to avoid rate limits
        if (i < articles.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
    } catch (error) {
      console.error('Error handling search mention:', error);
      await this.twitterClient.replyToTweet(mention.id,
        `@${mention.author.username} Oops, something went wrong with that search. Can you try again? ${this.personalityManager.getEmojis('general')}`);
    }
  }
  
  private async handleSummarizeMention(mention: TwitterMention, pmid: string) {
    try {
      // Reply acknowledging the request
      await this.twitterClient.replyToTweet(mention.id, 
        `Hey @${mention.author.username}! Getting that summary for PMID: ${pmid} ${this.personalityManager.getEmojis('general')}`);
      
      // Fetch and summarize the article
      const article = await this.fetchArticleById(pmid);
      const fullContent = await this.fetchFullArticleContent(article);
      
      // Generate the summary with personality
      const summary = this.generateSummary(article, fullContent);
      
      // Add mention to the summary
      const reply = `@${mention.author.username} ${summary}`;
      
      // Post the summary
      await this.twitterClient.replyToTweet(mention.id, reply);
    } catch (error) {
      console.error('Error handling summarize mention:', error);
      await this.twitterClient.replyToTweet(mention.id,
        `@${mention.author.username} Couldn't find that article (PMID: ${pmid}). Is the ID correct? ${this.personalityManager.getEmojis('general')}`);
    }
  }
  
  private async handleQuestionMention(mention: TwitterMention) {
    const text = mention.text.toLowerCase();
    
    // Try to identify topics in the question
    const topicMatches = this.priorityTopics.filter(topic => text.includes(topic));
    
    if (topicMatches.length > 0) {
      // Question mentions a specific topic
      const topic = topicMatches[0];
      
      // Reply with personality
      const response = this.personalityManager.generateTopicResponse(
        topic,
        "Let me find the latest research on this for you..."
      );
      
      await this.twitterClient.replyToTweet(mention.id, 
        `@${mention.author.username} ${response}`);
      
      // Search for articles on this topic
      try {
        const articles = await this.searchRecent
        private async handleQuestionMention(mention: TwitterMention) {
            const text = mention.text.toLowerCase();
            
            // Try to identify topics in the question
            const topicMatches = this.priorityTopics.filter(topic => text.includes(topic));
            
            if (topicMatches.length > 0) {
              // Question mentions a specific topic
              const topic = topicMatches[0];
              
              // Reply with personality
              const response = this.personalityManager.generateTopicResponse(
                topic,
                "Let me find the latest research on this for you..."
              );
              
              await this.twitterClient.replyToTweet(mention.id, 
                `@${mention.author.username} ${response}`);
              
              // Search for articles on this topic
              try {
                const articles = await this.searchRecentArticles(topic, 2);
                
                if (articles.length > 0) {
                  // Reply with the top article
                  const article = articles[0];
                  const fullContent = await this.fetchFullArticleContent(article);
                  const summary = this.generateSummary(article, fullContent);
                  
                  await this.twitterClient.replyToTweet(mention.id, 
                    `@${mention.author.username} Found something interesting! ${summary}`);
                } else {
                  await this.twitterClient.replyToTweet(mention.id,
                    `@${mention.author.username} Couldn't find recent research on ${topic}. Try another topic? ${this.personalityManager.getEmojis('general')}`);
                }
              } catch (error) {
                console.error('Error handling topic question:', error);
              }
            } else {
              // Generic question without specific topic
              const genericResponse = this.personalityManager.formatResponse('questionResponse', {
                topic: "medical research",
                answer: "To help you better, could you specify which medical topic you're interested in? Try mentioning a topic like neuroscience, cancer, vaccines, etc."
              });
              
              await this.twitterClient.replyToTweet(mention.id, 
                `@${mention.author.username} ${genericResponse}`);
            }
          }
          
          private async handleGreetingMention(mention: TwitterMention) {
            const greeting = this.personalityManager.generateGreeting(mention.author.username);
            
            await this.twitterClient.replyToTweet(mention.id, 
              `@${mention.author.username} ${greeting}`);
          }
          
          private async handleGenericMention(mention: TwitterMention) {
            // Generic response for other mentions
            const responses = [
              `Hey @${mention.author.username}! Not sure what you're asking for. Try asking about recent medical research or use "/search [topic]" to find articles! ${this.personalityManager.getEmojis('general')}`,
              `@${mention.author.username} Want to see the latest medical research? Try "/search [topic]" or ask me a question about a specific medical topic! ${this.personalityManager.getEmojis('general')}`,
              `Hi @${mention.author.username}! I'm here to share the freshest medical research. Ask me about a topic you're interested in! ${this.personalityManager.getEmojis('general')}`
            ];
            
            const response = responses[Math.floor(Math.random() * responses.length)];
            await this.twitterClient.replyToTweet(mention.id, response);
          }
          
          // Override the postTweet method to use the Twitter API
          async postTweet(text: string): Promise<void> {
            try {
              // Add to queue instead of posting immediately
              this.tweetQueue.push({
                text,
                time: new Date()
              });
              
              console.log(`Added tweet to queue. Queue length: ${this.tweetQueue.length}`);
            } catch (error) {
              console.error('Error queueing tweet:', error);
            }
          }
          
          // Override the replyToTweet method to use the Twitter API
          async replyToTweet(tweetId: string, text: string): Promise<void> {
            try {
              await this.twitterClient.replyToTweet(tweetId, text);
            } catch (error) {
              console.error('Error posting reply to Twitter:', error);
            }
          }
          
          // Override findAndTweetTopArticle to post to Twitter
          async findAndTweetTopArticle(): Promise<void> {
            // Use the original implementation
            await super.findAndTweetTopArticle();
          }
          
          // Override generateSummary to use personality
          generateSummary(article: any, content: any): string {
            // Extract key information for the summary
            const title = article.title.replace(/\.$/, '');
            const journal = article.journal;
            
            // Extract main points from abstract (using original logic)
            const abstractSentences = content.fullText.split(/\.\s+/);
            let mainPoint = abstractSentences.find(s => 
              s.toLowerCase().includes('conclude') || 
              s.toLowerCase().includes('finding') ||
              s.toLowerCase().includes('result')
            ) || abstractSentences[abstractSentences.length - 1];
            
            // Clean up the main point using original method
            mainPoint = this.simplifyText(mainPoint);
            
            // Generate hashtags using original method
            const hashtags = this.generateRelevantHashtags(article, content);
            
            // Determine primary topic for customization
            const primaryTopic = this.determineMainTopic(article, content);
            
            // Use personality system to format response
            let summary = this.personalityManager.formatResponse('summaryFormat', {
              articleTitle: title,
              journal: journal,
              simplifiedPoint: mainPoint,
              hashtags: hashtags
            });
            
            // Add topic-specific customization based on the bot's interests
            summary = this.personalityManager.customizeArticleSummary(summary, primaryTopic);
            
            return summary;
          }
          
          // Helper method to determine the main topic of an article
          private determineMainTopic(article: any, content: any): string {
            const fullText = (article.title + " " + content.fullText).toLowerCase();
            
            // Check against topic enthusiasm keys
            const topics = Object.keys(this.personalityManager['personality'].topicEnthusiasm);
            
            for (const topic of topics) {
              if (fullText.includes(topic)) {
                return topic;
              }
            }
            
            // Check against priority topics from original agent
            for (const topic of this.priorityTopics) {
              if (fullText.includes(topic)) {
                return topic;
              }
            }
            
            return "general";
          }
        }
        
        // Create the Twitter-enabled agent instance for export
        const twitterPubMedAgent = new TwitterPubMedAgent();
        
        export default twitterPubMedAgent;