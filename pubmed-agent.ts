import { Agent, Message, CommandHandler } from './agent-base';
import axios from 'axios';
import * as dotenv from 'dotenv';

dotenv.config();

// Types for PubMed API responses
interface PubMedArticle {
  id: string;
  title: string;
  abstract: string;
  authors: string[];
  publicationDate: string;
  journal: string;
  doi?: string;
  fullTextUrl?: string;
}

interface ArticleContent {
  id: string;
  fullText: string;
}

interface ArticleRating {
  id: string;
  score: number;
  novelty: number;
  impact: number;
  methodology: number;
  relevance: number;
  tweetable: boolean;
}

export class PubMedAgent extends Agent {
  protected apiKey: string;
  protected maxDailyTweets: number = 5;
  protected tweetsPostedToday: number = 0;
  protected lastTweetTime: Date = new Date();
  protected minScoreToTweet: number = 7.5;
  protected recentArticleIds: Set<string> = new Set();
  protected priorityTopics: string[] = [
    'vaccine', 'immunotherapy', 'CRISPR', 'artificial intelligence', 'machine learning',
    'precision medicine', 'genomics', 'microbiome', 'neuroscience', 'pandemic',
    'mental health', 'cancer research', 'rare disease', 'public health', 'drug discovery'
  ];
  
  protected avoidTopics: string[] = [
    'political', 'controversial', 'abortion', 'gun', 'religion', 'alternative medicine',
    'unproven therapy', 'unethical', 'retracted', 'disputed', 'lawsuit'
  ];

  constructor(config?: {name: string, description: string, version: string}) {
    super(config || {
      name: "MedSciDrops",
      description: "Your go-to for the freshest medical research takes 🧬🔬 No cap, just facts!",
      version: "1.0.0",
    });
    
    this.apiKey = process.env.PUBMED_API_KEY || '';
    
    if (!this.apiKey) {
      console.warn("Warning: No PubMed API key found in environment variables");
    }
    
    // Register command handlers
    this.registerCommands();
    
    // Schedule daily article searches and tweets
    this.scheduleJobs();
  }

  private registerCommands() {
    this.addCommandHandler(
      new CommandHandler({
        name: "search",
        description: "Search for recent medical articles on a specific topic",
        handler: async (msg: Message) => {
          const query = msg.content.trim();
          if (!query) {
            return this.reply(msg, "I need a topic to search for! Try something like 'cancer immunotherapy' or 'CRISPR advances'");
          }
          
          const articles = await this.searchRecentArticles(query, 5);
          return this.formatArticleListResponse(msg, articles, query);
        }
      })
    );
    
    this.addCommandHandler(
      new CommandHandler({
        name: "summarize",
        description: "Summarize a specific article by PubMed ID",
        handler: async (msg: Message) => {
          const pmid = msg.content.trim();
          if (!pmid || !/^\d+$/.test(pmid)) {
            return this.reply(msg, "I need a valid PubMed ID to summarize an article!");
          }
          
          try {
            const article = await this.fetchArticleById(pmid);
            const fullContent = await this.fetchFullArticleContent(article);
            const summary = this.generateSummary(article, fullContent);
            return this.reply(msg, summary);
          } catch (error) {
            return this.reply(msg, `Couldn't find that article, sorry! The error was: ${error.message}`);
          }
        }
      })
    );
  }

  private scheduleJobs() {
    // Reset tweet counter daily
    setInterval(() => {
      this.tweetsPostedToday = 0;
      this.recentArticleIds.clear();
    }, 24 * 60 * 60 * 1000); // 24 hours
    
    // Check for tweetable articles every 4 hours
    setInterval(async () => {
      if (this.tweetsPostedToday < this.maxDailyTweets) {
        await this.findAndTweetTopArticle();
      }
    }, 4 * 60 * 60 * 1000); // 4 hours
  }

  async onMessage(msg: Message): Promise<void> {
    // Handle direct messages or mentions not using commands
    if (!msg.isCommand() && (msg.isDM() || msg.isMention())) {
      const content = msg.content.toLowerCase();
      
      // Check for common question patterns
      if (content.includes('?') || 
          content.includes('what') || 
          content.includes('how') || 
          content.includes('why')) {
        this.handleQuestion(msg);
        return;
      }
      
      // Handle greetings
      if (this.isGreeting(content)) {
        this.reply(msg, this.getRandomResponse([
          "Hey there! What medical science tea are you looking for today? 👋",
          "Hi! Ready to drop some medical knowledge? What's on your mind? 🧠",
          "Sup! Looking for the latest in med research? I got you! ✨",
          "Hey! Your friendly neighborhood research bot here! What can I help with? 🔬"
        ]));
        return;
      }
      
      // Default response for other messages
      this.reply(msg, "Not sure what you're asking for. Try asking about recent medical research or use /search [topic] to find articles!");
    }
    
    // Let the command system handle commands
    await super.onMessage(msg);
  }
  
  protected isGreeting(text: string): boolean {
    const greetings = ['hi', 'hello', 'hey', 'sup', 'yo', 'greetings', 'howdy'];
    return greetings.some(greeting => text
        protected isGreeting(text: string): boolean {
            const greetings = ['hi', 'hello', 'hey', 'sup', 'yo', 'greetings', 'howdy'];
            return greetings.some(greeting => text.includes(greeting));
          }
          
          protected handleQuestion(msg: Message): void {
            const content = msg.content.toLowerCase();
            
            // Try to identify the topic from the question
            const topicMatches = this.priorityTopics.filter(topic => content.includes(topic));
            
            if (topicMatches.length > 0) {
              // There's a match with our priority topics
              this.reply(msg, `Interesting question about ${topicMatches[0]}! Let me search for the latest research on this...`);
              
              // Actually search and reply with results
              this.searchRecentArticles(topicMatches[0], 3)
                .then(articles => {
                  const response = this.formatArticleListResponse(msg, articles, topicMatches[0]);
                  this.reply(msg, response);
                })
                .catch(error => {
                  this.reply(msg, "Tried to find some research on that but hit a snag. Maybe try again with a different topic?");
                });
              
              return;
            }
            
            // Generic responses for other questions
            this.reply(msg, this.getRandomResponse([
              "Great question! To help you better, could you specify which medical topic you're curious about?",
              "I'd love to help with that! Could you mention a specific medical field or condition you're interested in?",
              "Cool question! To give you the freshest research, what specific area of medicine should I focus on?",
              "Interesting! What particular aspect of medical science would you like me to search for?"
            ]));
          }
        
          protected getRandomResponse(options: string[]): string {
            return options[Math.floor(Math.random() * options.length)];
          }
        
          async searchRecentArticles(query: string, limit: number = 10): Promise<PubMedArticle[]> {
            try {
              // Check if the query contains any topics to avoid
              if (this.avoidTopics.some(topic => query.toLowerCase().includes(topic))) {
                return [];
              }
              
              const response = await axios.get('https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi', {
                params: {
                  db: 'pubmed',
                  term: `${query} AND ("last 30 days"[PDat])`,
                  retmode: 'json',
                  retmax: limit * 2, // Fetch more than needed in case some don't have abstracts
                  api_key: this.apiKey
                }
              });
              
              const ids = response.data.esearchresult.idlist;
              
              if (!ids || ids.length === 0) {
                return [];
              }
              
              // Fetch details for each article
              const articlesResponse = await axios.get('https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi', {
                params: {
                  db: 'pubmed',
                  id: ids.join(','),
                  retmode: 'json',
                  api_key: this.apiKey
                }
              });
              
              const results = articlesResponse.data.result;
              const articles: PubMedArticle[] = [];
              
              // Process each article
              for (const id of ids) {
                const articleData = results[id];
                
                if (articleData && articleData.title && !articleData.title.includes('[Retracted]')) {
                  // Get author list
                  const authors = articleData.authors ? 
                    articleData.authors.map(author => `${author.name}`) : [];
                  
                  // Create article object
                  const article: PubMedArticle = {
                    id,
                    title: articleData.title,
                    abstract: articleData.abstract || "Abstract not available",
                    authors: authors,
                    publicationDate: articleData.pubdate || "Date not available",
                    journal: articleData.fulljournalname || articleData.source || "Journal not specified",
                    doi: articleData.elocationid || undefined
                  };
                  
                  articles.push(article);
                  
                  // Stop once we have enough articles
                  if (articles.length >= limit) {
                    break;
                  }
                }
              }
              
              return articles;
            } catch (error) {
              console.error('Error searching PubMed:', error);
              return [];
            }
          }
        
          async fetchArticleById(pmid: string): Promise<PubMedArticle> {
            try {
              const response = await axios.get('https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi', {
                params: {
                  db: 'pubmed',
                  id: pmid,
                  retmode: 'json',
                  api_key: this.apiKey
                }
              });
              
              const articleData = response.data.result[pmid];
              
              if (!articleData || !articleData.title) {
                throw new Error("Article not found");
              }
              
              // Get author list
              const authors = articleData.authors ? 
                articleData.authors.map(author => `${author.name}`) : [];
              
              // Create article object
              return {
                id: pmid,
                title: articleData.title,
                abstract: articleData.abstract || "Abstract not available",
                authors: authors,
                publicationDate: articleData.pubdate || "Date not available",
                journal: articleData.fulljournalname || articleData.source || "Journal not specified",
                doi: articleData.elocationid || undefined,
                fullTextUrl: this.getPossibleFullTextUrl(pmid)
              };
            } catch (error) {
              console.error('Error fetching article:', error);
              throw new Error("Failed to fetch article information");
            }
          }
        
          private getPossibleFullTextUrl(pmid: string): string {
            return `https://www.ncbi.nlm.nih.gov/pmc/articles/pmid/${pmid}/`;
          }
        
          async fetchFullArticleContent(article: PubMedArticle): Promise<ArticleContent> {
            // In a real implementation, this would use an API that can access full-text content
            // However, for this example, we'll use the abstract as a stand-in for full text
            
            try {
              // Try to fetch more detailed abstract using EFetch
              const response = await axios.get('https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi', {
                params: {
                  db: 'pubmed',
                  id: article.id,
                  retmode: 'xml',
                  api_key: this.apiKey
                }
              });
              
              // In a real implementation, you would parse the XML to extract more content
              // For now, we'll return the abstract we already have
              return {
                id: article.id,
                fullText: article.abstract || "Content not available"
              };
            } catch (error) {
              console.error('Error fetching full article content:', error);
              return {
                id: article.id,
                fullText: article.abstract || "Content not available"
              };
            }
          }
        
          rateArticle(article: PubMedArticle, content: ArticleContent): ArticleRating {
            // Initialize rating components
            let novelty = 0;
            let impact = 0;
            let methodology = 0;
            let relevance = 0;
            
            const fullText = (article.title + " " + content.fullText).toLowerCase();
            
            // Check for novelty indicators
            const noveltyTerms = [
              'first time', 'novel', 'breakthrough', 'pioneering', 'discovered', 
              'new approach', 'innovative', 'groundbreaking', 'first-in-human',
              'paradigm shift', 'revolutionize'
            ];
            novelty = this.scoreTermsPresence(fullText, noveltyTerms, 10);
            
            // Check for impact indicators
            const impactTerms = [
              'significant', 'substantial', 'major', 'important', 'crucial',
              'life-saving', 'effective', 'efficacy', 'survival', 'mortality',
              'quality of life', 'large cohort', 'multi-center', 'phase 3'
            ];
            impact = this.scoreTermsPresence(fullText, impactTerms, 10);
            
            // Check for methodology strength
            const methodologyTerms = [
              'randomized', 'double-blind', 'placebo-controlled', 'meta-analysis',
              'systematic review', 'large sample', 'longitudinal', 'prospective',
              'controlled trial', 'robust', 'validated', 'statistical significance'
            ];
            methodology = this.scoreTermsPresence(fullText, methodologyTerms, 10);
            
            // Check for relevance to wider population
            const relevanceTerms = [
              'public health', 'common disease', 'prevalent', 'population',
              'widespread', 'epidemic', 'pandemic', 'burden', 'incidence',
              'morbidity', 'mortality', 'preventable', 'treatment', 'therapy'
            ];
            relevance = this.scoreTermsPresence(fullText, relevanceTerms, 10);
            
            // Check for red flags (deduction from score)
            const redFlagTerms = [
              'preliminary', 'limited sample', 'pilot study', 'small cohort',
              'inconclusive', 'mixed results', 'further research needed',
              'conflicting', 'questionable', 'limitations', 'not statistically significant'
            ];
            const redFlagScore = this.scoreTermsPresence(fullText, redFlagTerms, 10);
            
            // Check for controversial topics
            const controversialScore = this.scoreTermsPresence(fullText, this.avoidTopics, 10);
            
            // Final weighted score calculation (scale of 0-10)
            let score = (
              (novelty * 0.25) + 
              (impact * 0.3) + 
              (methodology * 0.25) + 
              (relevance * 0.2) - 
              (redFlagScore * 0.5) -
              (controversialScore * 2)  // Heavy penalty for controversial topics
            );
            
            // Ensure score is within 0-10 range
            score = Math.max(0, Math.min(10, score));
            
            // Determine if the article is tweetable
            const tweetable = score >= this.minScoreToTweet && controversialScore < 0.5;
            
            return {
              id: article.id,
              score,
              novelty,
              impact,
              methodology,
              relevance,
              tweetable
            };
          }
          
          private scoreTermsPresence(text: string, terms: string[], maxScore: number): number {
            let matches = 0;
            
            for (const term of terms) {
              if (text.includes(term.toLowerCase())) {
                matches++;
              }
            }
            
            // Calculate score based on percentage of matching terms
            return (matches / terms.length) * maxScore;
          }
        
          generateSummary(article: PubMedArticle, content: ArticleContent): string {
            // Extract key information for the summary
            const title = article.title.replace(/\.$/, '');
            const journal = article.journal;
            const authors = article.authors.length > 0 
              ? (article.authors.length > 3 
                ? `${article.authors[0]} et al.` 
                : article.authors.join(', '))
              : 'researchers';
            
            // Gen-Z/AIXBT style elements
            const openings = [
              "Yooo, science just dropped some 🔥 findings!",
              "This research is lowkey mind-blowing fr fr 🧠✨",
              "Scientists back at it again with the breakthrough vibes ⚡",
              "New study just dropped and it's actually kinda wild 👀",
              "Medical science community eating good with this one 💯"
            ];
            
            const transitions = [
              "The takeaway?",
              "So basically,",
              "TL;DR:",
              "Here's the tea:",
              "The vibe check:"
            ];
            
            const closings = [
              "This could be huge for patients, no cap!",
              "We love to see medical science making moves!",
              "The future of medicine looking extra bright rn!",
              "Not me getting excited about medical research again!",
              "Gotta appreciate the scientists putting in that work!"
            ];
            
            // Extract main points from abstract (simplified NLP approach)
            const abstractSentences = content.fullText.split(/\.\s+/);
            let mainPoint = abstractSentences.find(s => 
              s.toLowerCase().includes('conclude') || 
              s.toLowerCase().includes('finding') ||
              s.toLowerCase().includes('result') ||
              s.toLowerCase().includes('demonstrate') ||
              s.toLowerCase().includes('show')
            ) || abstractSentences[abstractSentences.length - 1];
            
            // Clean up and simplify the main point
            mainPoint = this.simplifyText(mainPoint);
            
            // Build the summary
            const opening = this.getRandomResponse(openings);
            const transition = this.getRandomResponse(transitions);
            const closing = this.getRandomResponse(closings);
            
            return `${opening}\n\n${title} - just published in ${journal}.\n\n${transition} ${mainPoint}\n\n${closing}\n\n#MedicalResearch #Science ${this.generateRelevantHashtags(article, content)}`;
          }
          
          protected simplifyText(text: string): string {
            // This is a simplified version. In a real implementation,
            // you might use a more sophisticated NLP approach
            
            return text
              .replace(/^\s*(?:we|the authors|researchers|this study)\s+(?:found|demonstrate[ds]?|show[ns]?|conclude[ds]?|observe[ds]?|note[ds]?|report[ds]?)\s+that\s+/i, '')
              .replace(/\(.*?\)/g, '')  // Remove parenthetical expressions
              .replace(/\[.*?\]/g, '')  // Remove bracketed content
              .replace(/,\s*(?:respectively|however|therefore|thus|hence|moreover)\s*,/g, ',')
              .replace(/\s+/g, ' ')     // Normalize whitespace
              .trim()
              .replace(/^\s*(?:these|the|our)\s+(?:data|results|findings)\s+(?:suggest|indicate|show|demonstrate|reveal)\s+that\s+/i, '')
              .replace(/^\s*(?:it\s+(?:is|was)\s+(?:found|shown|demonstrated|concluded)\s+that)\s+/i, '')
              .replace(/\s+(?:p\s*(?:<|>|=)\s*0?\.\d+)/, '')  // Remove p-values
              .replace(/\s+\(\d+(?:\.\d+)?%\s*(?:CI|confidence interval)[^\)]+\)/, '')  // Remove confidence intervals
              + '.';  // Ensure it ends with a period
          }
          
          private generateRelevantHashtags(article: PubMedArticle, content: ArticleContent): string {
            const combinedText = (article.title + " " + content.fullText).toLowerCase();
            const possibleHashtags = [
              { term: 'cancer', tag: '#CancerResearch' },
              { term: 'diabet', tag: '#Diabetes' },
              { term: 'heart disease', tag: '#HeartHealth' },
              { term: 'cardio', tag: '#Cardiology' },
              { term: 'neuro', tag: '#Neuroscience' },
              { term: 'brain', tag: '#BrainResearch' },
              { term: 'covid', tag: '#COVID19' },
              { term: 'pandemic', tag: '#PandemicResearch' },
              { term: 'genetic', tag: '#Genetics' },
              { term: 'surgery', tag: '#Surgery' },
              { term: 'pediatric', tag: '#PediatricMedicine' },
              { term: 'children', tag: '#ChildHealth' },
              { term: 'mental health', tag: '#MentalHealth' },
              { term: 'psychiatr', tag: '#Psychiatry' },
              { term: 'vaccine', tag: '#Vaccines' },
              { term: 'drug', tag: '#DrugDevelopment' },
              { term: 'pharma', tag: '#Pharma' },
              { term: 'antibio', tag: '#Antibiotics' },
              { term: 'resistance', tag: '#AntimicrobialResistance' },
              { term: 'infection', tag: '#InfectiousDisease' }
            ];
            
            // Find matching hashtags
            const matchedTags = possibleHashtags
              .filter(item => combinedText.includes(item.term))
              .map(item => item.tag);
            
            // Take up to 3 hashtags
            return matchedTags.slice(0, 3).join(' ');
          }
        
          formatArticleListResponse(msg: Message, articles: PubMedArticle[], query: string): string {
            if (articles.length === 0) {
              return `Couldn't find any recent articles about "${query}". Maybe try a different search term?`;
            }
            
            const intro = this.getRandomResponse([
              `Found some fresh research on "${query}" 👀`,
              `Just dropped! Latest studies on "${query}" 🔬`,
              `Check out these new papers on "${query}" that scientists are buzzing about ✨`,
              `The science girlies/bois have been busy with "${query}" research 🧬`
            ]);
            
            let response = `${intro}\n\n`;
            
            // Add each article with Gen-Z flair
            articles.forEach((article, index) => {
              response += `${index + 1}. "${article.title}"\n`;
              response += `   ${this.formatAuthorsShort(article.authors)} in ${article.journal}\n`;
              response += `   PMID: ${article.id}\n\n`;
            });
            
            response += `Want me to summarize any of these? Just reply with "/summarize [PMID]" 💯`;
            
            return response;
          }
          
          protected formatAuthorsShort(authors: string[]): string {
            if (authors.length === 0) {
              return "Unknown authors";
            } else if (authors.length === 1) {
              return authors[0];
            } else {
              return `${authors[0]} et al.`;
            }
          }
        
          async findAndTweetTopArticle(): Promise<void> {
            // Search for articles on priority topics
            for (const topic of this.getRandomizedTopics()) {
              const articles = await this.searchRecentArticles(topic, 5);
              
              for (const article of articles) {
                // Skip if we've already seen this article
                if (this.recentArticleIds.has(article.id)) {
                  continue;
                }
                
                this.recentArticleIds.add(article.id);
                
                // Get full content and rate the article
                const fullContent = await this.fetchFullArticleContent(article);
                const rating = this.rateArticle(article, fullContent);
                
                if (rating.tweetable) {
                  // Generate and post the tweet
                  const tweetText = this.generateSummary(article, fullContent);
                  await this.postTweet(tweetText);
                  
                  // Update counters
                  this.tweetsPostedToday++;
                  this.lastTweetTime = new Date();
                  
                  return; // Found and tweeted an article, so we're done for now
                }
              }
            }
            
            console.log("No tweetable articles found in this round");
          }
          
          private getRandomizedTopics(): string[] {
            // Return a shuffled copy of priority topics
            return [...this.priorityTopics]
              .sort(() => Math.random() - 0.5)
              .slice(0, 5); // Take just 5 random topics to check
          }
        
          async postTweet(text: string): Promise<void> {
            // This would integrate with the Twitter API
            // For this example, we'll just log it
            console.log("TWEET POSTED:");
            console.log("--------------------");
            console.log(text);
            console.log("--------------------");
          }
        
          async replyToTweet(tweetId: string, text: string): Promise<void> {
            // This would integrate with the Twitter API
            console.log(`REPLY TO TWEET ${tweetId}:`);
            console.log("--------------------");
            console.log(text);
            console.log("--------------------");
          }
        }