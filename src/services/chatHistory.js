const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

export class ChatHistoryService {
  constructor() {
    this.baseUrl = API_BASE_URL;
  }

  // Get all chats
  async getAllChats() {
    try {
      const response = await fetch(`${this.baseUrl}/chats`);
      if (!response.ok) {
        throw new Error('Failed to fetch chats');
      }
      return await response.json();
    } catch (error) {
      console.error('Error fetching chats:', error);
      return [];
    }
  }

  // Create a new chat
  async createChat(title = 'New Chat') {
    try {
      const chat = {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        title,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        messageCount: 0
      };

      const response = await fetch(`${this.baseUrl}/chats`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(chat)
      });

      if (!response.ok) {
        throw new Error('Failed to create chat');
      }

      return await response.json();
    } catch (error) {
      console.error('Error creating chat:', error);
      throw error;
    }
  }

  // Get messages for a specific chat
  async getChatMessages(chatId) {
    try {
      const response = await fetch(`${this.baseUrl}/messages?chatId=${chatId}&_sort=createdAt&_order=asc`);
      if (!response.ok) {
        throw new Error('Failed to fetch messages');
      }
      return await response.json();
    } catch (error) {
      console.error('Error fetching messages:', error);
      return [];
    }
  }

  // Add a message to a chat
  async addMessage(chatId, message) {
    try {
      if (!chatId) {
        console.warn('addMessage called with null/undefined chatId');
        throw new Error('Chat ID is required to add a message');
      }

      const messageData = {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        chatId,
        role: message.role,
        content: message.content,
        createdAt: new Date().toISOString(),
        isTyping: message.isTyping || false
      };

      const response = await fetch(`${this.baseUrl}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(messageData)
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Failed to add message:', response.status, errorText);
        throw new Error(`Failed to add message: ${response.status} ${errorText}`);
      }

      // Update chat's message count and updatedAt
      await this.updateChat(chatId);

      return await response.json();
    } catch (error) {
      console.error('Error adding message:', error);
      throw error;
    }
  }

  // Update chat metadata
  async updateChat(chatId) {
    try {
      if (!chatId) {
        console.warn('updateChat called with null/undefined chatId');
        return null;
      }

      const messages = await this.getChatMessages(chatId);
      const lastMessage = messages[messages.length - 1];
      
      let title = 'New Chat';
      if (lastMessage && lastMessage.role === 'user') {
        title = lastMessage.content.slice(0, 50) + (lastMessage.content.length > 50 ? '...' : '');
      }

      const response = await fetch(`${this.baseUrl}/chats/${chatId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title,
          messageCount: messages.length,
          updatedAt: new Date().toISOString()
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Failed to update chat:', response.status, errorText);
        throw new Error(`Failed to update chat: ${response.status} ${errorText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error updating chat:', error);
      throw error;
    }
  }

  // Update chat title specifically
  async updateChatTitle(chatId, newTitle) {
    try {
      if (!chatId) {
        console.warn('updateChatTitle called with null/undefined chatId');
        return null;
      }

      const response = await fetch(`${this.baseUrl}/chats/${chatId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: newTitle,
          updatedAt: new Date().toISOString()
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Failed to update chat title:', response.status, errorText);
        throw new Error(`Failed to update chat title: ${response.status} ${errorText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error updating chat title:', error);
      throw error;
    }
  }

  // Delete a chat and all its messages
  async deleteChat(chatId) {
    try {
      // Delete all messages for this chat
      const messages = await this.getChatMessages(chatId);
      for (const message of messages) {
        await fetch(`${this.baseUrl}/messages/${message.id}`, {
          method: 'DELETE'
        });
      }

      // Delete the chat
      const response = await fetch(`${this.baseUrl}/chats/${chatId}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        throw new Error('Failed to delete chat');
      }

      return true;
    } catch (error) {
      console.error('Error deleting chat:', error);
      throw error;
    }
  }

  // Clear all messages from a chat
  async clearChatMessages(chatId) {
    try {
      const messages = await this.getChatMessages(chatId);
      for (const message of messages) {
        await fetch(`${this.baseUrl}/messages/${message.id}`, {
          method: 'DELETE'
        });
      }

      // Update chat metadata
      await this.updateChat(chatId);

      return true;
    } catch (error) {
      console.error('Error clearing chat messages:', error);
      throw error;
    }
  }
} 