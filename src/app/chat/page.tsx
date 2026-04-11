'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  tokens_used: number
  created_at: string
}

export default function Chat() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [userData, setUserData] = useState<any>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [tokenBalance, setTokenBalance] = useState(5)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    checkUser()
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  const checkUser = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      router.push('/')
      return
    }
    setUser(user)
    
    // Get user data
    const { data: userData } = await supabase
      .from('users')
      .select('*')
      .eq('id', user.id)
      .single()
    
    if (userData) {
      setUserData(userData)
      setTokenBalance(userData.token_balance || 0)
      
      // If no birth data, redirect to onboarding
      if (!userData.birth_date) {
        router.push('/onboarding')
        return
      }
    }
    
    // Load chat history
    loadMessages(user.id)
  }

  const loadMessages = async (userId: string) => {
    const { data } = await supabase
      .from('messages')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true })
    
    if (data) {
      setMessages(data)
    }
  }

  const sendMessage = async () => {
    if (!input.trim() || !user || !userData) return
    
    // Check token balance
    if (tokenBalance < 10) {
      alert('⚠️ Not enough tokens! You need 10 tokens to ask a question. Please buy more tokens.')
      return
    }
    
    setLoading(true)
    const userMessage = input.trim()
    setInput('')
    
    // Add user message to UI
    const tempUserMsg: Message = {
      id: 'temp-user',
      role: 'user',
      content: userMessage,
      tokens_used: 0,
      created_at: new Date().toISOString()
    }
    setMessages(prev => [...prev, tempUserMsg])
    
    try {
      // Call your Render API
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://arthnumro-api.onrender.com'
      
      const response = await fetch(`${API_URL}/api/chat/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: user.id,
          message: userMessage,
          user_data: {
            name: userData.name,
            life_path: userData.life_path,
            birth_date: userData.birth_date,
            birth_time: userData.birth_time,
            birth_place: userData.birth_place
          }
        })
      })
      
      const data = await response.json()
      
      if (data.success) {
        // Add assistant message
        const assistantMsg: Message = {
          id: data.message_id || 'temp-assistant',
          role: 'assistant',
          content: data.response,
          tokens_used: 10,
          created_at: new Date().toISOString()
        }
        
        setMessages(prev => [...prev.filter(m => m.id !== 'temp-user'), 
          { ...tempUserMsg, id: data.user_message_id || 'user-' + Date.now() },
          assistantMsg
        ])
        
        // Update token balance
        setTokenBalance(prev => prev - 10)
        
        // Save messages to Supabase
        await supabase.from('messages').insert([
          {
            user_id: user.id,
            role: 'user',
            content: userMessage,
            tokens_used: 0
          },
          {
            user_id: user.id,
            role: 'assistant',
            content: data.response,
            tokens_used: 10
          }
        ])
        
        // Update token balance in database
        await supabase
          .from('users')
          .update({ token_balance: tokenBalance - 10 })
          .eq('id', user.id)
        
      } else {
        throw new Error(data.error || 'Failed to get response')
      }
      
    } catch (error: any) {
      console.error('Error:', error)
      alert('⚠️ Error: ' + error.message + '\n\nMake sure your Render API is running!')
      setMessages(prev => prev.filter(m => m.id !== 'temp-user'))
    } finally {
      setLoading(false)
    }
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/')
  }

  if (!userData) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-600 to-indigo-800 flex items-center justify-center">
        <div className="text-white text-xl">Loading...</div>
      </div>
    )
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white px-6 py-4 shadow-lg">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">✨ Arthnumro AI</h1>
            <p className="text-sm text-purple-100">Chat with your numerology guide</p>
          </div>
          
          <div className="flex items-center gap-4">
            {/* Token Balance */}
            <div className="bg-white/20 backdrop-blur-sm px-4 py-2 rounded-lg">
              <div className="text-xs text-purple-100">Tokens</div>
              <div className="text-xl font-bold">{tokenBalance} 💎</div>
            </div>
            
            {/* User Menu */}
            <div className="flex items-center gap-3">
              <div className="text-right">
                <div className="font-semibold">{userData.name}</div>
                <div className="text-xs text-purple-100">Life Path {userData.life_path}</div>
              </div>
              <button
                onClick={handleSignOut}
                className="bg-white/20 hover:bg-white/30 px-3 py-2 rounded-lg text-sm transition"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Chat Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="max-w-4xl mx-auto space-y-4">
          {/* Welcome Message */}
          {messages.length === 0 && (
            <div className="bg-white rounded-2xl shadow-md p-6 border-l-4 border-purple-500">
              <h2 className="text-xl font-bold text-gray-800 mb-3">
                👋 Welcome, {userData.name}!
              </h2>
              <p className="text-gray-600 mb-4">
                I'm your personal AI numerologist. I know your Life Path is {userData.life_path}, and I'm here to guide you.
              </p>
              <div className="bg-purple-50 rounded-lg p-4">
                <p className="font-semibold text-purple-900 mb-2">Try asking me:</p>
                <ul className="space-y-1 text-sm text-purple-800">
                  <li>• "What does my Life Path {userData.life_path} mean?"</li>
                  <li>• "What career should I pursue?"</li>
                  <li>• "Am I compatible with Life Path 5?"</li>
                  <li>• "What should I focus on this year?"</li>
                  <li>• "Tell me about my spiritual gifts"</li>
                </ul>
              </div>
            </div>
          )}

          {/* Messages */}
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[80%] rounded-2xl px-6 py-4 ${
                  message.role === 'user'
                    ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white'
                    : 'bg-white shadow-md text-gray-800 border border-gray-100'
                }`}
              >
                <div className="whitespace-pre-wrap">{message.content}</div>
                {message.role === 'assistant' && message.tokens_used > 0 && (
                  <div className="text-xs text-gray-500 mt-2">
                    Cost: {message.tokens_used} tokens
                  </div>
                )}
              </div>
            </div>
          ))}

          {/* Loading */}
          {loading && (
            <div className="flex justify-start">
              <div className="bg-white shadow-md rounded-2xl px-6 py-4 border border-gray-100">
                <div className="flex items-center gap-2 text-gray-600">
                  <div className="w-2 h-2 bg-purple-600 rounded-full animate-bounce"></div>
                  <div className="w-2 h-2 bg-purple-600 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                  <div className="w-2 h-2 bg-purple-600 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                  <span className="ml-2">Consulting the stars...</span>
                </div>
              </div>
            </div>
          )}
          
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input Area */}
      <div className="bg-white border-t border-gray-200 px-4 py-4 shadow-lg">
        <div className="max-w-4xl mx-auto">
          {tokenBalance < 10 && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2 text-yellow-800">
                <span className="text-xl">⚠️</span>
                <span className="font-medium">Low on tokens! You need 10 tokens per question.</span>
              </div>
              <button className="bg-yellow-500 hover:bg-yellow-600 text-white px-4 py-2 rounded-lg font-semibold text-sm transition">
                Buy Tokens
              </button>
            </div>
          )}
          
          <div className="flex gap-3">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
              placeholder="Ask me anything about your numerology..."
              disabled={loading || tokenBalance < 10}
              className="flex-1 px-6 py-4 border-2 border-gray-200 rounded-xl focus:border-purple-500 focus:ring-2 focus:ring-purple-200 outline-none text-lg disabled:bg-gray-100 disabled:cursor-not-allowed"
            />
            <button
              onClick={sendMessage}
              disabled={loading || !input.trim() || tokenBalance < 10}
              className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white px-8 py-4 rounded-xl font-semibold text-lg disabled:opacity-50 disabled:cursor-not-allowed transition duration-200 shadow-lg"
            >
              {loading ? '⏳' : '💬'} Send
            </button>
          </div>
          
          <div className="text-center text-xs text-gray-500 mt-2">
            Each question costs 10 tokens 💎
          </div>
        </div>
      </div>
    </div>
  )
}