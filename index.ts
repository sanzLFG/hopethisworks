import twitterPubMedAgent from './twitter-pubmed-agent';

// Start the Twitter-enabled PubMed agent
console.log('Starting Twitter PubMed AI Agent...');

twitterPubMedAgent.start().then((success) => {
  if (success) {
    console.log('Twitter PubMed AI Agent is now running!');
    console.log('The bot will:');
    console.log('1. Automatically find and tweet about high-quality medical research');
    console.log('2. Respond to Twitter mentions and commands like /search and /summarize');
    console.log('3. Answer questions about medical topics');
  } else {
    console.error('Failed to start Twitter PubMed AI Agent.');
    console.error('Please check your API keys and internet connection.');
  }
}).catch(error => {
  console.error('Error starting agent:', error);
});

// Handle process termination gracefully
process.on('SIGINT', () => {
  console.log('Shutting down Twitter PubMed AI Agent...');
  // Any cleanup code would go here
  process.exit(0);
});