export class Agent {
    protected name: string;
    protected description: string;
    protected version: string;
    
    constructor(config: {name: string, description: string, version: string}) {
      this.name = config.name;
      this.description = config.description;
      this.version = config.version;
    }
    
    async start() {
      console.log(`Starting agent: ${this.name}`);
      return true;
    }
    
    reply(message: any, content: string) {
      console.log(`Reply to message: ${content}`);
    }
    
    async onMessage(msg: Message): Promise<void> {
      console.log(`Received message: ${msg.content}`);
    }
    
    addCommandHandler(handler: CommandHandler) {
      console.log(`Registered command: ${handler.name}`);
    }
  }
  
  export class Message {
    content: string;
    author?: {displayName: string};
    
    constructor(content: string, author?: {displayName: string}) {
      this.content = content;
      this.author = author;
    }
    
    isDM() {
      return true;
    }
    
    isMention() {
      return false;
    }
    
    isCommand() {
      return this.content.startsWith('/');
    }
  }
  
  export class CommandHandler {
    name: string;
    description: string;
    handler: (msg: Message) => Promise<any>;
    
    constructor(config: {name: string, description: string, handler: (msg: Message) => Promise<any>}) {
      this.name = config.name;
      this.description = config.description;
      this.handler = config.handler;
    }
  }