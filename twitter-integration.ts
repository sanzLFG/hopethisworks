import { TwitterApi } from 'twitter-api-v2';
import * as dotenv from 'dotenv';

dotenv.config();

export class TwitterClient {
  private client: TwitterApi;
  private readonly userId: string;
  private isReady: boolean = false;

  constructor() {
    // Check for required environment variables
    const requiredVars = [
      'TWITTER_API_KEY',
      'TWITTER_API_SECRET',
      'TWITTER_ACCESS_TOKEN',
      'TWITTER_ACCESS_SECRET'
    ];
    
    const missingVars = requiredVars.filter(varName => !process.env[varName]);
    
    if (missingVars.length > 0) {
      console.error(`Missing required environment variables: ${missingVars.join(', ')}`);
      throw new Error('Missing Twitter API credentials');
    }
    
    // Create Twitter client
    this.client = new TwitterApi({
      appKey: process.env.TWITTER_API_KEY!,
      appSecret: process.env.TWITTER_API_SECRET!,
      accessToken: process.env.TWITTER_ACCESS_TOKEN!,
      accessSecret: process.env.TWITTER_ACCESS_SECRET!,
    });
    
    // User ID will be fetched during initialization
    this.userId = '';
    
    // Initialize client
    this.initialize();
  }
  
  private async initialize() {
    try {
      // Verify credentials and get user info
      const currentUser = await this.client.v2.me();
      
      if (currentUser && currentUser.data) {
        console.log(`Connected to Twitter as @${currentUser.data.username}`);
        this.isReady = true;
      } else {
        console.error('Failed to get Twitter user information');
      }
    } catch (error) {
      console.error('Error initializing Twitter client:', error);
      throw new Error('Failed to initialize Twitter client');
    }
  }
  
  async waitUntilReady(): Promise<boolean> {
    // Simple wait for initialization
    let attempts = 0;
    while (!this.isReady && attempts < 10) {
      await new Promise(resolve => setTimeout(resolve, 500));
      attempts++;
    }
    return this.isReady;
  }
  
  async postTweet(text: string): Promise<string | null> {
    if (!this.isReady) {
      await this.waitUntilReady();
    }
    
    try {
      // Ensure tweet is within Twitter's character limit (280)
      const truncatedText = text.length > 280 ? text.substring(0, 277) + '...' : text;
      
      // Post the tweet
      const result = await this.client.v2.tweet(truncatedText);
      
      if (result && result.data && result.data.id) {
        console.log(`Tweet posted successfully! ID: ${result.data.id}`);
        return result.data.id;
      } else {
        console.error('Failed to post tweet:', result);
        return null;
      }
    } catch (error) {
      console.error('Error posting tweet:', error);
      return null;
    }
  }
  
  async replyToTweet(tweetId: string, text: string): Promise<string | null> {
    if (!this.isReady) {
      await this.waitUntilReady();
    }
    
    try {
      // Ensure reply is within Twitter's character limit
      const truncatedText = text.length > 280 ? text.substring(0, 277) + '...' : text;
      
      // Post the reply
      const result = await this.client.v2.reply(truncatedText, tweetId);
      
      if (result && result.data && result.data.id) {
        console.log(`Reply posted successfully! ID: ${result.data.id}`);
        return result.data.id;
      } else {
        console.error('Failed to post reply:', result);
        return null;
      }
    } catch (error) {
      console.error('Error posting reply:', error);
      return null;
    }
  }
  
  async setupMentionListener(callback: (tweet: any) => Promise<void>) {
    if (!this.isReady) {
      await this.waitUntilReady();
    }
    
    try {
      // Set up filtered stream rules to catch mentions
      const rules = await this.client.v2.streamRules();
      
      // Remove any existing rules
      if (rules.data && rules.data.length > 0) {
        await this.client.v2.updateStreamRules({
          delete: { ids: rules.data.map(rule => rule.id) }
        });
      }
      
      // Add rule to catch mentions
      await this.client.v2.updateStreamRules({
        add: [{ value: 'has:mentions' }]
      });
      
      console.log('Twitter mention listener set up successfully');
      
      // Start filtered stream
      const stream = await this.client.v2.searchStream({
        'tweet.fields': ['referenced_tweets', 'author_id', 'created_at', 'conversation_id'],
        'user.fields': ['name', 'username'],
        'expansions': ['author_id', 'referenced_tweets.id']
      });
      
      // Listen for mentions
      stream.on('data', async tweetData => {
        // Process the mention
        await callback(tweetData);
      });
      
      stream.on('error', error => {
        console.error('Error in Twitter stream:', error);
      });
      
    } catch (error) {
      console.error('Error setting up Twitter mention listener:', error);
    }
  }
  
  // Additional methods can be added as needed
  async searchTweets(query: string, maxResults: number = 10): Promise<any[]> {
    if (!this.isReady) {
      await this.waitUntilReady();
    }
    
    try {
      const searchResults = await this.client.v2.search(query, {
        'max_results': maxResults,
        'tweet.fields': ['created_at', 'public_metrics'],
        'user.fields': ['username'],
        'expansions': ['author_id']
      });
      
      return searchResults.data.data || [];
    } catch (error) {
      console.error('Error searching tweets:', error);
      return [];
    }
  }
}