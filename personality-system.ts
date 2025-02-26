import * as fs from 'fs';
import * as path from 'path';

// Personality type definitions
interface BotPersonality {
  name: string;
  bio: string;
  persona: {
    background: string;
    tone: string;
    quirks: string[];
  };
  vocabulary: {
    positiveReactions: string[];
    transitionPhrases: string[];
    introStarters: string[];
    closingRemarks: string[];
    greetings: string[];
  };
  topicEnthusiasm: {
    [key: string]: number;
  };
  emojiSets: {
    [key: string]: string[];
  };
  responsePatterns: {
    [key: string]: string;
  };
}

export class PersonalityManager {
  private personality: BotPersonality;
  private lastUsedPhrases: Map<string, Set<string>> = new Map();
  private quirkProbability: number = 0.7; // 70% chance to use quirks
  
  constructor(personalityFilePath: string) {
    try {
      const personalityData = fs.readFileSync(personalityFilePath, 'utf8');
      this.personality = JSON.parse(personalityData);
      this.initLastUsedPhrases();
    } catch (error) {
      console.error('Error loading personality file:', error);
      throw new Error('Failed to load personality configuration');
    }
  }
  
  private initLastUsedPhrases(): void {
    // Initialize tracking for each vocabulary category
    for (const category in this.personality.vocabulary) {
      this.lastUsedPhrases.set(category, new Set<string>());
    }
  }
  
  getName(): string {
    return this.personality.name;
  }
  
  getBio(): string {
    return this.personality.bio;
  }
  
  // Get a random item from vocabulary that hasn't been used recently
  getPhrase(category: keyof BotPersonality['vocabulary']): string {
    const phrases = this.personality.vocabulary[category];
    if (!phrases || phrases.length === 0) {
      return '';
    }
    
    const lastUsed = this.lastUsedPhrases.get(category.toString()) || new Set<string>();
    
    // Filter out recently used phrases if possible
    let availablePhrases = phrases.filter(phrase => !lastUsed.has(phrase));
    
    // If all phrases have been recently used, reset and use all
    if (availablePhrases.length === 0) {
      lastUsed.clear();
      availablePhrases = phrases;
    }
    
    // Select a random phrase
    const selectedPhrase = availablePhrases[Math.floor(Math.random() * availablePhrases.length)];
    
    // Track this phrase as recently used
    lastUsed.add(selectedPhrase);
    
    // If we've used more than half the phrases, start forgetting the oldest ones
    if (lastUsed.size > phrases.length / 2) {
      const oldestPhrase = Array.from(lastUsed)[0];
      lastUsed.delete(oldestPhrase);
    }
    
    this.lastUsedPhrases.set(category.toString(), lastUsed);
    return selectedPhrase;
  }
  
  // Get emojis based on context
  getEmojis(category: keyof BotPersonality['emojiSets'], count: number = 1): string {
    const emojiSet = this.personality.emojiSets[category] || this.personality.emojiSets.general;
    
    let result = '';
    const usedIndices = new Set<number>();
    
    for (let i = 0; i < count; i++) {
      let index;
      // Try to get unique emojis unless we've used them all
      do {
        index = Math.floor(Math.random() * emojiSet.length);
      } while (usedIndices.has(index) && usedIndices.size < emojiSet.length);
      
      usedIndices.add(index);
      result += emojiSet[index] + ' ';
    }
    
    return result.trim();
  }
  
  // Get enthusiasm level for a topic
  getTopicEnthusiasm(topic: string): number {
    // Look for exact match
    if (this.personality.topicEnthusiasm[topic]) {
      return this.personality.topicEnthusiasm[topic];
    }
    
    // Look for partial match
    for (const [key, value] of Object.entries(this.personality.topicEnthusiasm)) {
      if (topic.includes(key) || key.includes(topic)) {
        return value;
      }
    }
    
    // Default enthusiasm
    return 5;
  }
  
  // Apply personality quirks based on probability
  applyQuirks(text: string): string {
    if (Math.random() > this.quirkProbability) {
      return text; // No quirk this time
    }
    
    const quirks = this.personality.persona.quirks;
    const selectedQuirk = quirks[Math.floor(Math.random() * quirks.length)];
    
    // Apply the quirk based on what it is
    switch (selectedQuirk) {
      case "uses too many emojis":
        // Add 2-3 extra emojis
        return text + ' ' + this.getEmojis('excitement', 2 + Math.floor(Math.random() * 2));
        
      case "occasionally references memes":
        const memeReferences = [
          " (iykyk)",
          " *chef's kiss*",
          " (living for this)",
          " (it's giving innovation)",
          " (main character energy)",
          " (rent free in my mind)"
        ];
        return text + memeReferences[Math.floor(Math.random() * memeReferences.length)];
        
      case "gets genuinely excited about breakthrough research":
        if (text.includes("breakthrough") || text.includes("revolutionary") || 
            text.includes("first time") || text.includes("discover")) {
          const excitedAdditions = [
            " THIS IS HUGE!",
            " I can't stress enough how important this is!",
            " We're witnessing history!",
            " This changes everything!",
            " I'm literally shaking!"
          ];
          return text + excitedAdditions[Math.floor(Math.random() * excitedAdditions.length)];
        }
        return text;
        
      case "calls followers 'science besties'":
        if (text.includes("you") || text.includes("interested") || text.includes("want")) {
          return text.replace(/you/i, "you science besties");
        }
        return text;
        
      case "has a slight obsession with brain research":
        if (text.toLowerCase().includes("brain") || text.toLowerCase().includes("neuro")) {
          const brainAdditions = [
            " (brains are literally my favorite organ, btw)",
            " (brain research is life!)",
            " (neuroscience stans unite!)",
            " (the brain? superior organ, no competition)"
          ];
          return text + brainAdditions[Math.floor(Math.random() * brainAdditions.length)];
        }
        return text;
        
      default:
        return text;
    }
  }
  
  // Format response using pattern and filling in variables
  formatResponse(patternKey: string, variables: {[key: string]: string}): string {
    let pattern = this.personality.responsePatterns[patternKey] || '{introStarter} {positiveReaction}';
    
    // Replace pattern variables with actual content
    for (const [key, value] of Object.entries(variables)) {
      pattern = pattern.replace(new RegExp(`{${key}}`, 'g'), value);
    }
    
    // Replace standard vocabulary placeholders
    pattern = pattern.replace(/{introStarter}/g, this.getPhrase('introStarters'));
    pattern = pattern.replace(/{positiveReaction}/g, this.getPhrase('positiveReactions'));
    pattern = pattern.replace(/{closingRemark}/g, this.getPhrase('closingRemarks'));
    pattern = pattern.replace(/{transitionPhrase}/g, this.getPhrase('transitionPhrases'));
    pattern = pattern.replace(/{emoji}/g, this.getEmojis('general'));
    
    // Apply random quirks
    return this.applyQuirks(pattern);
  }
  
  // Generate a greeting based on time of day and user info
  generateGreeting(username?: string): string {
    let greeting = this.getPhrase('greetings');
    
    if (username) {
      greeting = greeting.replace(/there|sup|hey|hi/i, `$& ${username}`);
    }
    
    return this.applyQuirks(greeting);
  }
  
  // Generate a response about a specific topic with appropriate enthusiasm
  generateTopicResponse(topic: string, factoid: string): string {
    const enthusiasm = this.getTopicEnthusiasm(topic);
    let enthusiasmText = '';
    
    if (enthusiasm >= 9) {
      enthusiasmText = "I'm literally OBSESSED with research on this!";
    } else if (enthusiasm >= 7) {
      enthusiasmText = "This is one of my favorite research areas!";
    } else if (enthusiasm >= 5) {
      enthusiasmText = "This is pretty interesting research!";
    } else {
      enthusiasmText = "There's some interesting work happening here.";
    }
    
    const emojiCategory = enthusiasm >= 8 ? 'excitement' : 'general';
    
    return this.formatResponse('topicIntroduction', {
      topic,
      enthusiasm: enthusiasmText,
      relatedFacts: factoid,
      emoji: this.getEmojis(emojiCategory)
    });
  }
  
  // Customize an article summary based on topic and content
  customizeArticleSummary(summary: string, topic: string): string {
    const enthusiasm = this.getTopicEnthusiasm(topic);
    
    // For high enthusiasm topics, add more personality
    if (enthusiasm >= 8) {
      const enhancers = [
        `\n\nAnd honestly? This is the content I live for. ${this.getEmojis('excitement', 2)}`,
        `\n\nThe way this research just made my whole day? Unmatched. ${this.getEmojis('excitement')}`,
        `\n\nThis is the kind of science that keeps me going. ${this.getEmojis('excitement')}`,
        `\n\nIf you're not excited about this, we can't be friends. ${this.getEmojis('excitement')}`
      ];
      
      return summary + enhancers[Math.floor(Math.random() * enhancers.length)];
    }
    
    return summary;
  }
}