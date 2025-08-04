# 🤖 AI Healthcare Chatbot Platform

A modern, intelligent healthcare chatbot platform built with React and powered by advanced AI models including Google Gemma 3 12B through OpenRouter API and specialized Google AI agents.

## 🌟 Features

### 🤖 **Advanced AI Capabilities**
- **Multi-Model Support**: Google Gemma 3 12B via OpenRouter API
- **Specialized Healthcare AI**: Google AI agents for medical consultations
- **Real-time Streaming**: Live response generation with chunk-by-chunk updates
- **Intelligent Context Management**: RAG (Retrieval-Augmented Generation) system

### 🏥 **Healthcare-Focused Features**
- **Symptom Consultation**: AI-powered symptom analysis and recommendations
- **Medication Guidance**: Drug information and dosage recommendations
- **Nutrition Advice**: Dietary recommendations and meal planning
- **Mental Health Support**: Psychological consultation and stress management
- **Emergency Assessment**: Urgent medical situation evaluation
- **Disease Information**: Comprehensive disease and condition information
- **Lifestyle Coaching**: Healthy living and wellness guidance

### 💬 **Chat Experience**
- **Multi-Conversation Support**: Create, manage, and switch between multiple chat sessions
- **Persistent Chat History**: Automatic saving and retrieval of conversations
- **Smart Chat Naming**: Automatic title generation based on conversation content
- **Real-time Updates**: Live message streaming with typing indicators
- **Markdown Support**: Rich text formatting for responses

### 🎨 **Modern UI/UX**
- **Dark/Light Theme**: Toggle between themes with persistent preferences
- **Responsive Design**: Works seamlessly on desktop and mobile devices
- **Sidebar Navigation**: Easy access to chat history and settings
- **Smooth Animations**: Polished user experience with smooth transitions
- **Accessibility**: Built with accessibility best practices

### 🔧 **Technical Features**
- **Modular Architecture**: Clean, maintainable codebase with service separation
- **Error Handling**: Comprehensive error management and user feedback
- **Security**: Secure API key management and environment variable protection
- **Performance**: Optimized for fast loading and smooth interactions
- **Analytics**: Built-in usage tracking and performance monitoring

### 🎶 ***To-do in the upcoming:***
- In this project, when completed your build-version all stylesheet/scripts will be export because we don't make any call to server like requested for authentication so that **CLIENT-process** and it's has bumped many hidden gems from your source, just make senses about protecting your flow (means AI Prompted in the background). I will update the middleware structure of project in the next few weeks. From now, this project just basic at all. Keep focus on **build your own backend" with higher security.
- Chat Unique-id on URL-params (expected to share with doctor-networking).
- Adding Deep Thinking to dive in the uploaded.
- Adding supporting media files.
- Updating Multilanguage Responding to user.

## 🚀 Quick Start

### Prerequisites
- Node.js (v16 or higher)
- npm or yarn package manager
- API keys for OpenRouter and Google AI Studio

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/know-self/potential-medical-ai.git
   cd potential-medical-ai
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp env.example .env
   ```
   
   Edit `.env` file with your API keys:
   ```env
   VITE_OPENROUTER_API_KEY=your_openrouter_api_key_here
   VITE_GOOGLE_AI_API_KEY=your_google_ai_api_key_here
   VITE_API_BASE_URL=your-json-server
   ```

4. **Start the development server**
   ```bash
   npm run dev
   ```

4.1. **Build the production server**
   ```bash
   npm run build
   ```

5. **Open your browser**
   Navigate to `http://localhost:3000` & `http://localhost:3001`

6. **Deployment later**
   Comming soon.

## 🔑 API Keys Setup

### OpenRouter API Key
1. Visit [OpenRouter](https://openrouter.ai/keys)
2. Create an account and generate an API key
3. Add the key to your `.env` file as `VITE_OPENROUTER_API_KEY`

### Google AI API Key
1. Visit [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Create a new API key
3. Add the key to your `.env` file as `VITE_GOOGLE_AI_API_KEY`

## 🏗️ Project Structure

```
AI_platform/
├── json-server/
│   ├── db.json              # Structed DB
│   ├── package.json	     # Dependencies and scripts
│   ├── server.js 	     # Build and security scripts
├── src/
│   ├── components/          # React components
│   │   ├── ChatHeader.jsx   # Chat header with controls
│   │   ├── ChatInput.jsx    # Message input component
│   │   ├── ChatMessage.jsx  # Individual message display
│   │   ├── ChatSidebar.jsx  # Sidebar navigation
│   │   ├── ThemeToggle.jsx  # Theme switching
│   │   └── WelcomeMessage.jsx # Welcome screen
│   ├── services/            # Business logic and API services
│   │   ├── analytics/       # Analytics and tracking
│   │   ├── flow/           # Prompt management system
│   │   ├── orchestrator/   # Healthcare orchestrator
│   │   ├── parallel/       # Parallel processing
│   │   ├── rag/            # RAG (Retrieval-Augmented Generation)
│   │   ├── chatHistory.js  # Chat history management
│   │   ├── googleAI.js     # Google AI integration
│   │   └── openrouter.js   # OpenRouter API integration
│   └── utils/              # Utility functions
├── scripts/                # Build and security scripts
├── db.json                # Local chat storage
└── package.json           # Dependencies and scripts
```

## 🧠 AI Architecture

### Healthcare Orchestrator
The core AI system consists of three main components:

1. **RAG Step**: Retrieves relevant medical knowledge and context
2. **Parallel Step**: Generates AI responses using multiple models simultaneously
3. **Analytics Step**: Tracks usage patterns and performance metrics

### Flow System
- **Intelligent Prompt Management**: Automatically selects appropriate prompts based on user queries
- **Multi-language Support**: Handles both English and Vietnamese
- **Context-Aware Responses**: Maintains conversation context across sessions

## 📱 Usage

### Starting a New Chat
1. Click the "New Chat" button in the sidebar
2. Type your healthcare-related question
3. Receive AI-powered responses with medical insights

### Managing Conversations
- **Switch between chats**: Use the sidebar to navigate between different conversations
- **Delete chats**: Right-click on a chat to delete it
- **Rename chats**: Click on the chat title to edit it
- **Clear current chat**: Use the clear button to start fresh

### Example Queries
- "I have a headache and fever, what should I do?"
- "What are the side effects of aspirin?"
- "Can you recommend a healthy diet for diabetes?"
- "I'm feeling anxious and stressed, any advice?"
- "What are the symptoms of COVID-19?"

## 🔧 Development

### Available Scripts
```bash
npm run dev          # Start development server
npm run build        # Build for production
npm run preview      # Preview production build
npm run server       # Start JSON server for local data
```
### Run JSON server to handle basic Database (Setup with Render.com)
```
// server.js
const jsonServer = require('json-server')
const server = jsonServer.create()
const router = jsonServer.router('db.json')
const middlewares = jsonServer.defaults()

// CORS tùy chỉnh
server.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', 'https://yourdomain.com') // hoặc thay bằng '*'
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization')

  if (req.method === 'OPTIONS') {
    return res.sendStatus(204)
  }

  next()
})

// Body parser cho POST/PUT
server.use(jsonServer.bodyParser)

// Middleware mặc định của json-server
server.use(middlewares)
// Route mặc định
server.use(router)

const port = process.env.PORT || 3001
server.listen(port, () => {
  console.log(`✅ JSON Server running at http://localhost:${port}`)
})

// package.json
{
    "name": "json-server-api",
    "version": "1.0.0",
    "main": "server.js",
    "scripts": {
      "start": "node server.js",
      "dev": "json-server --watch db.json --port 3001"
    },
    "dependencies": {
      "json-server": "^0.17.4"
    }
  }

//db.json
{
  "chats": [],
  "messages": []
}
```

### Adding New Features
1. **New AI Models**: Add to `src/services/` directory
2. **New Components**: Create in `src/components/` directory
3. **New Prompts**: Extend the flow system in `src/services/flow/`
4. **New Analytics**: Add to `src/services/analytics/`

## 🔒 Security

### API Key Management
- Never commit `.env` files to version control
- Use different API keys for development and production
- Rotate API keys regularly (every 90 days recommended)
- Monitor API usage and set up alerts

### Security Best Practices
- All sensitive data is stored in environment variables
- Input validation and sanitization implemented
- Error handling prevents information leakage
- Regular security audits and updates

## 📊 Performance

### Optimization Features
- **Code Splitting**: Dynamic imports for better loading times
- **Caching**: Intelligent caching of responses and context
- **Streaming**: Real-time response generation
- **Lazy Loading**: Components load on demand

### Monitoring
- Built-in analytics tracking
- Performance metrics collection
- Error monitoring and reporting
- Usage pattern analysis

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Guidelines
- Follow the existing code style and architecture
- Add tests for new features
- Update documentation for any changes
- Ensure security best practices are followed

## 📄 License

This project is licensed under the Apache-2.0 License.

## 🙏 Acknowledgments

- **OpenRouter**: For providing access to Google Gemma 3 12B
- **Google AI**: For specialized healthcare AI capabilities
- **React Team**: For the amazing framework
- **Vite**: For the fast build tool
- **Tailwind CSS**: For the utility-first CSS framework

## 📞 Support

If you encounter any issues or have questions:

1. Check the [Issues](https://github.com/know-self/potential-medical-ai/issues) page
2. Create a new issue with detailed information
3. Include your environment details and error messages

## 🔄 Updates

Stay updated with the latest features and improvements by:
- Watching the repository
- Following the release notes
- Checking the [CHANGELOG](CHANGELOG.md) for detailed updates

---

**Note**: This AI platform is designed for educational and informational purposes. It should not replace professional medical advice. Always consult with qualified healthcare professionals for medical decisions. 