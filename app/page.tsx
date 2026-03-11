'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import FocusLock from 'react-focus-lock';
import Image from 'next/image';
import { 
  Search, Plus, Trash2, Info, Sparkles, LayoutGrid, List, 
  ChevronRight, Share2, Image as ImageIcon, Music, Upload, 
  FileText, X, Play, Pause, Zap, Copy, Check, Moon, Sun
} from 'lucide-react';
import { getEmbedding, getBatchEmbeddings, cosineSimilarity, MultimodalPart } from '@/lib/embeddings';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

type Modality = 'text' | 'image' | 'audio';

interface Item {
  id: string;
  text: string;
  type: Modality;
  data?: string; // base64 for images/audio
  mimeType?: string;
  embedding: number[] | null | undefined;
  similarity?: number;
}

const parseEmbedding = (embedding: any): number[] | null => {
  if (!embedding) return null;
  if (Array.isArray(embedding)) return embedding;
  if (typeof embedding === 'string') {
    try {
      // Supabase vector format is "[0.1, 0.2, ...]"
      return JSON.parse(embedding);
    } catch (e) {
      // If it's not valid JSON, it might be the postgres format "{0.1, 0.2, ...}"
      try {
        return embedding.replace('{', '[').replace('}', ']').split(',').map(Number);
      } catch (e2) {
        console.error("Failed to parse embedding string:", embedding);
        return null;
      }
    }
  }
  return null;
};

export default function EmbeddingPlayground() {
  const [items, setItems] = useState<Item[]>([]);
  const [seedItem, setSeedItem] = useState<Item | null>(null);
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [inputText, setInputText] = useState('');
  const [isSearchMode, setIsSearchMode] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [hoveredItemId, setHoveredItemId] = useState<string | null>(null);
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newText, setNewText] = useState('');
  const [copied, setCopied] = useState(false);
  const [isSearchUploadModalOpen, setIsSearchUploadModalOpen] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [embeddingError, setEmbeddingError] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  
  const imageInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const laneRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Dark Mode Effect
  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') as 'light' | 'dark' | null;
    if (savedTheme) {
      setTheme(savedTheme);
    } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      // Default to light as requested, but check system preference if no saved theme
      // Actually, user said "light should be the default", so I'll just default to light.
    }
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    const body = document.body;
    if (theme === 'dark') {
      root.classList.add('dark');
      body.classList.add('dark');
    } else {
      root.classList.remove('dark');
      body.classList.remove('dark');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  };

  // Initial example data
  useEffect(() => {
    const examples = [
      "A playful puppy",
      "Busy city street",
      "Snowy mountain peak",
      "Hot morning coffee",
      "The king and the queen",
      "A sleepy kitten",
      "A tropical parrot",
      "Hot cheese pizza",
      "I like to eat bananas",
      "A crisp red apple"
    ];
    
    const init = async () => {
      setIsLoading(true);
      try {
        // 1. Try to fetch from Supabase first
        const itemsRes = await fetch('/api/items');
        const supabaseItems = await itemsRes.json();
        
        if (supabaseItems && Array.isArray(supabaseItems) && supabaseItems.length > 0) {
          const mappedItems: Item[] = supabaseItems.map((item: any) => ({
            id: item.id,
            text: item.content,
            type: item.metadata?.type || 'text',
            data: item.metadata?.data,
            mimeType: item.metadata?.mimeType,
            embedding: parseEmbedding(item.embedding),
          }));
          setItems(mappedItems);
        } else {
          if (supabaseItems?.error) {
            console.warn("Supabase error fetching items, falling back to seeding:", supabaseItems.error);
          }
          // 2. If empty, seed Supabase with initial data
          const datasetRes = await fetch('/api/dataset');
          if (!datasetRes.ok) throw new Error('Failed to fetch dataset from API');
          const datasetFiles = await datasetRes.json();
          
          const multimodalItems: (string | MultimodalPart[])[] = [
            ...examples,
            ...datasetFiles.map((file: any) => ([{
              inlineData: {
                data: file.data,
                mimeType: file.mimeType
              }
            }]))
          ];

          const embeddings = await getBatchEmbeddings(multimodalItems);
          
          const newItems: Item[] = [];

          // Save text examples
          for (let i = 0; i < examples.length; i++) {
            const itemData = {
              content: examples[i],
              metadata: { type: 'text' },
              embedding: embeddings[i]
            };
            const saveRes = await fetch('/api/items', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(itemData)
            });
            const savedItem = await saveRes.json();
            if (savedItem.error) {
              console.error("Error saving text example:", savedItem.error);
              continue;
            }
            newItems.push({
              id: savedItem.id,
              text: savedItem.content,
              type: savedItem.metadata?.type || 'text',
              embedding: parseEmbedding(savedItem.embedding),
            });
          }

          // Save file examples
          for (let i = 0; i < datasetFiles.length; i++) {
            const file = datasetFiles[i];
            const itemData = {
              content: file.name,
              metadata: { 
                type: file.type,
                data: file.data,
                mimeType: file.mimeType
              },
              embedding: embeddings[examples.length + i]
            };
            const saveRes = await fetch('/api/items', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(itemData)
            });
            const savedItem = await saveRes.json();
            if (savedItem.error) {
              console.error("Error saving file example:", savedItem.error);
              continue;
            }
            newItems.push({
              id: savedItem.id,
              text: savedItem.content,
              type: savedItem.metadata?.type || 'text',
              data: savedItem.metadata?.data,
              mimeType: savedItem.metadata?.mimeType,
              embedding: parseEmbedding(savedItem.embedding),
            });
          }

          setItems(newItems);
        }
      } catch (error) {
        console.error("Failed to load initial data:", error);
        setEmbeddingError(true);
      } finally {
        setIsLoading(false);
        setIsInitialLoad(false);
      }
    };
    
    init();
  }, []);

  const triggerSearch = async (embedding: number[]) => {
    setIsLoading(true);
    try {
      const searchRes = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          embedding: embedding,
          match_threshold: 0.1,
          match_count: 50
        })
      });
      const results = await searchRes.json();
      
      if (results && !results.error) {
        const mappedResults: Item[] = results.map((item: any) => ({
          id: item.id,
          text: item.content,
          type: item.metadata?.type || 'text',
          data: item.metadata?.data,
          mimeType: item.metadata?.mimeType,
          embedding: parseEmbedding(item.embedding),
          similarity: item.similarity
        }));
        
        setItems(prev => {
          const updated = prev.map(item => {
            const match = mappedResults.find(r => r.id === item.id);
            return match ? { ...item, similarity: match.similarity } : { ...item, similarity: 0 };
          });
          return updated;
        });
      }
    } catch (error) {
      console.error("Search error:", error);
      setEmbeddingError(true);
    } finally {
      setIsLoading(false);
    }
  };

  const handleTextSearch = async (queryOverride?: string) => {
    const query = queryOverride || inputText;
    if (!query.trim()) return;
    setIsLoading(true);
    try {
      const embedding = await getEmbedding(query);
      if (!embedding) throw new Error("Failed to get embedding");
      
      const newItem: Item = {
        id: `text-search-${Date.now()}`,
        text: query,
        type: 'text',
        embedding: embedding,
      };
      setSeedItem(newItem);
      if (!queryOverride) setInputText('');
      
      await triggerSearch(embedding);
    } catch (error) {
      console.error("Search error:", error);
      setEmbeddingError(true);
      setIsLoading(false);
    }
  };

  const handleAddText = async (text: string) => {
    if (!text.trim()) return;
    setIsLoading(true);
    try {
      const embedding = await getEmbedding(text);
      
      // Save to Supabase
      const itemData = {
        content: text,
        metadata: { type: 'text' },
        embedding: embedding
      };
      const saveRes = await fetch('/api/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(itemData)
      });
      const savedItem = await saveRes.json();
      if (savedItem.error) throw new Error(savedItem.error);

      const newItem: Item = {
        id: savedItem.id,
        text: savedItem.content,
        type: savedItem.metadata?.type || 'text',
        embedding: parseEmbedding(savedItem.embedding),
      };
      setItems(prev => [newItem, ...prev]);
      // We don't set as seed here so it appears in the lanes
      setNewText('');
      setIsAddModalOpen(false);
    } catch (error) {
      console.error("Error adding text:", error);
      setEmbeddingError(true);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: Modality) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileError(null);

    // Validate file types
    const allowedImageTypes = ['image/jpeg', 'image/png'];
    const allowedAudioTypes = ['audio/mpeg', 'audio/wav', 'audio/mp3', 'audio/x-wav'];
    
    if (type === 'image' && !allowedImageTypes.includes(file.type)) {
      setFileError("Unsupported image type. Please use JPG or PNG.");
      if (e.target) e.target.value = '';
      return;
    }
    if (type === 'audio' && !allowedAudioTypes.includes(file.type)) {
      setFileError("Unsupported audio type. Please use MP3 or WAV.");
      if (e.target) e.target.value = '';
      return;
    }

    // Check audio duration
    if (type === 'audio') {
      try {
        const audio = new Audio();
        audio.src = URL.createObjectURL(file);
        await new Promise((resolve, reject) => {
          audio.onloadedmetadata = () => {
            URL.revokeObjectURL(audio.src);
            resolve(null);
          };
          audio.onerror = () => {
            URL.revokeObjectURL(audio.src);
            reject(new Error("Failed to load audio metadata"));
          };
        });
        if (audio.duration > 80) {
          setFileError("Audio files must be shorter than 80 seconds.");
          if (e.target) e.target.value = '';
          return;
        }
      } catch (err) {
        console.error("Error checking audio duration:", err);
        setFileError("Could not verify audio duration.");
        if (e.target) e.target.value = '';
        return;
      }
    }

    setIsLoading(true);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          resolve(result.split(',')[1]);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const multimodalInput: MultimodalPart[] = [{
        inlineData: {
          data: base64,
          mimeType: file.type
        }
      }];

      const embedding = await getEmbedding(multimodalInput);
      if (!embedding) throw new Error("Failed to get embedding");

      // Save to Supabase
      const itemData = {
        content: file.name,
        metadata: { 
          type: type,
          data: base64,
          mimeType: file.type
        },
        embedding: embedding
      };
      const saveRes = await fetch('/api/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(itemData)
      });
      const savedItem = await saveRes.json();
      if (savedItem.error) throw new Error(savedItem.error);

      const newItem: Item = {
        id: savedItem.id,
        text: savedItem.content,
        type: savedItem.metadata?.type || 'text',
        data: savedItem.metadata?.data,
        mimeType: savedItem.metadata?.mimeType,
        embedding: parseEmbedding(savedItem.embedding),
      };

      if (isSearchMode) {
        setSeedItem(newItem);
        await triggerSearch(embedding);
      } else {
        setItems(prev => [newItem, ...prev]);
      }
      
      // Close modals on success
      setIsSearchUploadModalOpen(false);
      setIsAddModalOpen(false);
    } catch (error: any) {
      console.error(`Error uploading ${type}:`, error);
      const isInvalidArgument = error?.message?.includes('INVALID_ARGUMENT') || 
                            error?.status === 400 || 
                            JSON.stringify(error).includes('INVALID_ARGUMENT');
      
      if (isInvalidArgument) {
        setFileError("The provided input format is not supported.");
      } else {
        setFileError(`Failed to process ${type} file.`);
        setEmbeddingError(true);
      }
    } finally {
      setIsLoading(false);
      setIsSearchMode(false);
      if (e.target) e.target.value = '';
    }
  };

  const handleDeleteItem = async (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    try {
      // Optimistic update
      setItems(prev => prev.filter(item => item.id !== id));
      if (seedItem?.id === id) setSeedItem(null);
      if (selectedItem?.id === id) setSelectedItem(null);

      // Delete from Supabase
      await fetch(`/api/items?id=${id}`, { method: 'DELETE' });
    } catch (error) {
      console.error("Error deleting item:", error);
    }
  };

  const handleCopyEmbedding = () => {
    if (!selectedItem?.embedding) return;
    const embeddingStr = JSON.stringify(selectedItem.embedding);
    navigator.clipboard.writeText(embeddingStr);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const laneResults = useMemo(() => {
    if (!seedItem || !seedItem.embedding) {
      // Show all items, newest first (items state is already [newItem, ...prev])
      return {
        text: items.filter(it => it.type === 'text'),
        image: items.filter(it => it.type === 'image'),
        audio: items.filter(it => it.type === 'audio'),
      };
    }

    const scored = items
      .filter(item => item.id !== seedItem.id)
      .map(item => ({
        ...item,
        similarity: item.embedding ? cosineSimilarity(seedItem.embedding!, item.embedding) : 0
      }))
      .sort((a, b) => b.similarity - a.similarity);

    return {
      text: scored.filter(it => it.type === 'text').slice(0, 20),
      image: scored.filter(it => it.type === 'image').slice(0, 20),
      audio: scored.filter(it => it.type === 'audio').slice(0, 20),
    };
  }, [seedItem, items]);

  const isStrongMatch = React.useCallback((item: Item) => {
    if (item.similarity === undefined) return false;
    let threshold = 0.60;
    
    if (seedItem?.type === 'image') {
      threshold = item.type === 'image' ? 0.75 : 0.35;
    } else {
      threshold = item.type === 'image' ? 0.35 : 0.60;
    }
    
    return item.similarity >= threshold;
  }, [seedItem]);

  const isMediumMatch = React.useCallback((item: Item) => {
    if (item.similarity === undefined) return false;
    let threshold = 0.55;
    
    if (seedItem?.type === 'image') {
      threshold = item.type === 'image' ? 0.70 : 0.30;
    } else {
      threshold = item.type === 'image' ? 0.30 : 0.55;
    }
    
    return item.similarity >= threshold && !isStrongMatch(item);
  }, [seedItem, isStrongMatch]);

  const isSignificantMatch = React.useCallback((item: Item) => isStrongMatch(item) || isMediumMatch(item), [isStrongMatch, isMediumMatch]);

  const hasAnySignificantMatch = useMemo(() => {
    if (!seedItem) return false;
    return Object.values(laneResults).some(lane => lane.some(it => isSignificantMatch(it)));
  }, [laneResults, seedItem, isSignificantMatch]);

  // Bridge Visualization Logic removed
  
  return (
    <div className="h-screen bg-[#F8F9FA] dark:bg-[#0A0A0A] text-[#1A1A1A] dark:text-[#F5F5F5] font-sans selection:bg-[#3B82F6]/20 selection:text-[#3B82F6] overflow-hidden flex flex-col transition-colors duration-300">
      {/* Header */}
      <header className="py-6 md:py-8 border-b border-black/5 dark:border-white/5 bg-white dark:bg-[#111111] flex flex-col items-center justify-center px-4 md:px-6 shrink-0 z-40 relative transition-colors duration-300">
        <div className="w-full flex flex-col md:flex-row items-center justify-between gap-4 mb-6">
          <div className="hidden md:flex w-32 items-center gap-2">
            <button 
              onClick={() => setIsAboutOpen(true)}
              className="flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-white/5 border border-black/10 dark:border-white/10 text-black/60 dark:text-white/60 rounded-lg text-[10px] font-bold hover:bg-black/5 dark:hover:bg-white/10 transition-all"
            >
              <Info size={12} />
              About
            </button>
            <button 
              onClick={toggleTheme}
              className="p-1.5 bg-white dark:bg-white/5 border border-black/10 dark:border-white/10 text-black/60 dark:text-white/60 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 transition-all"
              title={theme === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode'}
            >
              {theme === 'light' ? <Moon size={12} /> : <Sun size={12} />}
            </button>
          </div>

          <div className="flex flex-col items-center">
            <h1 className="font-bold text-lg md:text-xl tracking-tight text-black/90 dark:text-white/90">Multimodal Search</h1>
            <p className="text-[9px] md:text-[10px] font-medium text-black/40 dark:text-white/40 uppercase tracking-widest">Powered by Gemini Embedding 2</p>
          </div>

          <div className="hidden md:flex w-32 justify-end">
            <button 
              onClick={() => setIsAddModalOpen(true)}
              className="flex items-center gap-2 px-3 py-1.5 bg-black dark:bg-white text-white dark:text-black rounded-lg text-[10px] font-bold hover:bg-[#3B82F6] dark:hover:bg-[#3B82F6] dark:hover:text-white transition-all shadow-sm"
            >
              <Plus size={12} />
              Add New
            </button>
          </div>

          {/* Mobile Buttons */}
          <div className="flex md:hidden items-center gap-2 w-full justify-center">
            <button 
              onClick={() => setIsAboutOpen(true)}
              className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-white dark:bg-white/5 border border-black/10 dark:border-white/10 text-black/60 dark:text-white/60 rounded-lg text-[10px] font-bold hover:bg-black/5 dark:hover:bg-white/10 transition-all"
            >
              <Info size={12} />
              About
            </button>
            <button 
              onClick={toggleTheme}
              className="flex items-center justify-center p-2 bg-white dark:bg-white/5 border border-black/10 dark:border-white/10 text-black/60 dark:text-white/60 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 transition-all"
            >
              {theme === 'light' ? <Moon size={14} /> : <Sun size={14} />}
            </button>
            <button 
              onClick={() => setIsAddModalOpen(true)}
              className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-black dark:bg-white text-white dark:text-black rounded-lg text-[10px] font-bold hover:bg-[#3B82F6] dark:hover:bg-[#3B82F6] dark:hover:text-white transition-all shadow-sm"
            >
              <Plus size={12} />
              Add New
            </button>
          </div>
        </div>

        <div className="w-full max-w-2xl flex items-center gap-2 bg-black/[0.03] dark:bg-white/[0.03] border border-black/5 dark:border-white/5 rounded-xl p-1.5 focus-within:bg-white dark:focus-within:bg-white/10 focus-within:shadow-sm transition-all relative">
          <Search size={14} className="opacity-20 dark:opacity-40 ml-2" />
          <input 
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleTextSearch()}
            placeholder="Search for matches across text, images, and audio..."
            className="bg-transparent border-none outline-none flex-1 text-xs placeholder:text-black/50 dark:placeholder:text-white/50 text-black dark:text-white"
          />
          
          <div className="flex items-center gap-1">
            {/* Hidden File Inputs */}
            <input 
              type="file" 
              ref={imageInputRef} 
              className="hidden" 
              accept="image/jpeg,image/png" 
              onChange={(e) => handleFileUpload(e, 'image')}
            />
            <input 
              type="file" 
              ref={audioInputRef} 
              className="hidden" 
              accept="audio/mpeg,audio/wav,audio/x-wav,audio/mp3" 
              onChange={(e) => handleFileUpload(e, 'audio')}
            />

            <button 
              onClick={() => { setIsSearchMode(true); setIsSearchUploadModalOpen(true); }}
              className="p-1.5 hover:bg-black/5 dark:hover:bg-white/5 rounded-lg text-black/40 dark:text-white/40 hover:text-[#3B82F6] transition-all"
              title="Search by Image"
            >
              <ImageIcon size={14} />
            </button>
            <button 
              onClick={() => { setIsSearchMode(true); setIsSearchUploadModalOpen(true); }}
              className="p-1.5 hover:bg-black/5 dark:hover:bg-white/5 rounded-lg text-black/40 dark:text-white/40 hover:text-[#3B82F6] transition-all"
              title="Search by Audio File"
            >
              <Music size={14} />
            </button>
          </div>
        </div>

        <div className="flex flex-col items-center gap-3 mt-4">
          <div className="flex items-center gap-2 flex-wrap justify-center">
            {['cat', 'food', 'city'].map((suggestion) => (
              <button
                key={suggestion}
                onClick={() => handleTextSearch(suggestion)}
                className="px-3 py-1 rounded-full bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-[10px] font-medium text-black/40 dark:text-white/40 hover:text-black/60 dark:hover:text-white/60 transition-all"
              >
                {suggestion}
              </button>
            ))}
          </div>

          <AnimatePresence>
            {seedItem && (
              <motion.div 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="flex items-center gap-2 px-3 py-1.5 bg-[#3B82F6] border border-[#3B82F6]/10 rounded-lg shadow-lg shadow-[#3B82F6]/20 max-w-full overflow-hidden"
              >
                <span className="text-[10px] font-bold text-white uppercase flex items-center gap-1 shrink-0">
                  <Zap size={10} fill="currentColor" />
                  Active Search:
                </span>
                <div className="flex items-center gap-2 bg-white/10 px-2 py-0.5 rounded-md min-w-0">
                  {seedItem.type === 'image' && <ImageIcon size={10} className="text-white shrink-0" />}
                  {seedItem.type === 'audio' && <Music size={10} className="text-white shrink-0" />}
                  {seedItem.type === 'text' && <FileText size={10} className="text-white shrink-0" />}
                  <span className="text-[10px] font-bold text-white truncate max-w-[80px] md:max-w-[120px]">{seedItem.text}</span>
                </div>
                <button 
                  onClick={() => setSeedItem(null)} 
                  className="text-white/60 hover:text-white transition-colors ml-1 shrink-0"
                  title="Clear Search"
                >
                  <X size={12} />
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </header>
      
      {embeddingError && (
        <div className="bg-red-500 text-white text-center py-2 text-xs font-bold z-50 shrink-0">
          Embedding generation failed. Search functionality will not be available.
        </div>
      )}

      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* Main Content: Tri-Lane Layout */}
        <main className="flex-1 overflow-y-auto md:overflow-hidden grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-black/5 dark:divide-white/5">
          {/* Lane 1: Text */}
          <div className="flex flex-col h-full overflow-hidden min-h-[400px] md:min-h-0">
            <div className="p-3 border-b border-black/5 dark:border-white/5 bg-black/[0.01] dark:bg-white/[0.01] flex items-center gap-2">
              <FileText size={12} className="text-[#3B82F6] opacity-40" />
              <h2 className="text-[10px] font-bold uppercase tracking-widest opacity-40 dark:text-white/80">01 // Text</h2>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {laneResults.text.map((item, idx) => (
                <motion.div
                  key={item.id}
                  ref={el => { laneRefs.current[item.id] = el }}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ 
                    opacity: hasAnySignificantMatch && !isSignificantMatch(item) ? 0.4 : 1, 
                    y: 0,
                    scale: isStrongMatch(item) ? 1.02 : 1
                  }}
                  transition={{ delay: idx * 0.03 }}
                  onMouseEnter={() => setHoveredItemId(item.id)}
                  onMouseLeave={() => setHoveredItemId(null)}
                  onClick={() => setSelectedItem(item)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setSelectedItem(item);
                    }
                  }}
                  tabIndex={0}
                  role="button"
                  aria-label={`View details for: ${item.text}`}
                  className={cn(
                    "group relative p-4 bg-white dark:bg-[#1A1A1A] border rounded-xl transition-all cursor-pointer focus-visible:ring-2 focus-visible:ring-[#3B82F6] focus-visible:outline-none",
                    isStrongMatch(item) 
                      ? "border-[#3B82F6] shadow-[0_0_15px_rgba(59,130,246,0.15)] z-10 ring-1 ring-[#3B82F6]/20" 
                      : "border-black/5 dark:border-white/5 hover:border-[#3B82F6]/20 hover:shadow-md",
                    hasAnySignificantMatch && !isSignificantMatch(item) && "opacity-50 grayscale-[0.2]"
                  )}
                >
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {isStrongMatch(item) && (
                          <div className="flex items-center gap-1 bg-[#3B82F6] text-white text-[8px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider">
                            <Sparkles size={8} />
                            Strong Match
                          </div>
                        )}
                        <div className={cn(
                          "text-[9px] font-mono font-bold px-1.5 py-0.5 rounded",
                          isStrongMatch(item) ? "bg-[#3B82F6] text-white" : "text-[#3B82F6] dark:text-[#60A5FA]"
                        )}>
                          {item.similarity ? `${Math.round(item.similarity * 100)}% Match` : '—'}
                        </div>
                      </div>
                      <button 
                        onClick={(e) => handleDeleteItem(item.id, e)}
                        onKeyDown={(e) => e.stopPropagation()}
                        className="opacity-0 group-hover:opacity-40 hover:!opacity-100 text-red-500 transition-all p-1 hover:bg-red-50 dark:hover:bg-red-900/20 rounded focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:outline-none"
                        aria-label={`Delete item: ${item.text}`}
                      >
                        <Trash2 size={10} />
                      </button>
                    </div>
                    <p className="text-[13px] leading-relaxed font-medium text-black/80 dark:text-white/80">{item.text}</p>
                  </div>
                  {item.similarity !== undefined && (
                    <div className="mt-3 h-0.5 w-full bg-black/5 dark:bg-white/10 rounded-full overflow-hidden">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${item.similarity * 100}%` }}
                        className="h-full bg-[#3B82F6]"
                      />
                    </div>
                  )}
                </motion.div>
              ))}
            </div>
          </div>

          {/* Lane 2: Image */}
          <div className="flex flex-col h-full overflow-hidden bg-black/[0.005] dark:bg-white/[0.005] min-h-[400px] md:min-h-0">
            <div className="p-3 border-b border-black/5 dark:border-white/5 bg-black/[0.01] dark:bg-white/[0.01] flex items-center gap-2">
              <ImageIcon size={12} className="text-[#3B82F6] opacity-40" />
              <h2 className="text-[10px] font-bold uppercase tracking-widest opacity-40 dark:text-white/80">02 // Image</h2>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {laneResults.image.map((item, idx) => (
                <motion.div
                  key={item.id}
                  ref={el => { laneRefs.current[item.id] = el }}
                  initial={{ opacity: 0, scale: 0.95, height: 140 }}
                  animate={{ 
                    opacity: hasAnySignificantMatch && !isSignificantMatch(item) ? 0.4 : 1, 
                    scale: isStrongMatch(item) ? 1.02 : 1,
                    height: seedItem ? 100 + (item.similarity || 0) * 80 : 140
                  }}
                  transition={{ delay: idx * 0.03 }}
                  onMouseEnter={() => setHoveredItemId(item.id)}
                  onMouseLeave={() => setHoveredItemId(null)}
                  onClick={() => setSelectedItem(item)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setSelectedItem(item);
                    }
                  }}
                  tabIndex={0}
                  role="button"
                  aria-label={`View details for: ${item.text}`}
                  className={cn(
                    "group relative rounded-xl overflow-hidden border transition-all cursor-pointer shadow-sm min-h-[100px] focus-visible:ring-2 focus-visible:ring-[#3B82F6] focus-visible:outline-none",
                    isStrongMatch(item)
                      ? "border-[#3B82F6] shadow-[0_0_20px_rgba(59,130,246,0.3)] z-10 ring-2 ring-[#3B82F6]/30"
                      : "border-black/5 dark:border-white/10 hover:border-[#3B82F6]/40 hover:shadow-md",
                    hasAnySignificantMatch && !isSignificantMatch(item) && "opacity-40 grayscale-[0.5]"
                  )}
                >
                  <Image 
                    src={`data:${item.mimeType};base64,${item.data}`} 
                    alt={item.text}
                    fill
                    className="object-cover opacity-90 group-hover:opacity-100 transition-opacity"
                    referrerPolicy="no-referrer"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent flex flex-col justify-end p-3">
                    <div className="flex justify-between items-end">
                      <div className="flex flex-col min-w-0">
                        {isStrongMatch(item) && (
                          <div className="flex items-center gap-1 text-[#3B82F6] text-[8px] font-bold mb-1 uppercase tracking-wider bg-white/90 dark:bg-black/80 px-1.5 py-0.5 rounded self-start shadow-sm">
                            <Sparkles size={8} />
                            Strong Match
                          </div>
                        )}
                        <span className="text-[9px] font-bold uppercase truncate pr-4 text-white drop-shadow-md">{item.text}</span>
                        {item.similarity !== undefined && (
                          <span className={cn(
                            "text-[10px] font-bold drop-shadow-md",
                            isStrongMatch(item) ? "text-[#3B82F6] bg-white dark:bg-black/50 px-1 rounded inline-block w-fit mt-0.5" : "text-white/90"
                          )}>
                            {Math.round(item.similarity * 100)}% Match
                          </span>
                        )}
                      </div>
                      <button 
                        onClick={(e) => handleDeleteItem(item.id, e)}
                        onKeyDown={(e) => e.stopPropagation()}
                        className="p-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-all shadow-lg opacity-0 group-hover:opacity-100 transform translate-y-2 group-hover:translate-y-0 focus-visible:opacity-100 focus-visible:translate-y-0 focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none"
                        aria-label={`Delete item: ${item.text}`}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>

                    {item.similarity !== undefined && (
                      <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/10 dark:bg-white/10 overflow-hidden">
                        <motion.div 
                          initial={{ width: 0 }}
                          animate={{ width: `${item.similarity * 100}%` }}
                          className="h-full bg-[#3B82F6]"
                        />
                      </div>
                    )}
                  </div>
                </motion.div>
              ))}
            </div>
          </div>

          {/* Lane 3: Audio */}
          <div className="flex flex-col h-full overflow-hidden min-h-[400px] md:min-h-0">
            <div className="p-3 border-b border-black/5 dark:border-white/5 bg-black/[0.01] dark:bg-white/[0.01] flex items-center gap-2">
              <Music size={12} className="text-[#3B82F6] opacity-40" />
              <h2 className="text-[10px] font-bold uppercase tracking-widest opacity-40 dark:text-white/80">03 // Audio</h2>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {laneResults.audio.map((item, idx) => (
                <motion.div
                  key={item.id}
                  ref={el => { laneRefs.current[item.id] = el }}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ 
                    opacity: hasAnySignificantMatch && !isSignificantMatch(item) ? 0.4 : 1, 
                    y: 0,
                    scale: isStrongMatch(item) ? 1.02 : 1
                  }}
                  transition={{ delay: idx * 0.03 }}
                  onMouseEnter={() => setHoveredItemId(item.id)}
                  onMouseLeave={() => setHoveredItemId(null)}
                  onClick={() => setSelectedItem(item)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setSelectedItem(item);
                    }
                  }}
                  tabIndex={0}
                  role="button"
                  aria-label={`View details for: ${item.text}`}
                  className={cn(
                    "group p-4 bg-white dark:bg-[#1A1A1A] border rounded-xl transition-all cursor-pointer focus-visible:ring-2 focus-visible:ring-[#3B82F6] focus-visible:outline-none",
                    isStrongMatch(item)
                      ? "border-[#3B82F6] shadow-[0_0_15px_rgba(59,130,246,0.15)] z-10 ring-1 ring-[#3B82F6]/20"
                      : "border-black/5 dark:border-white/10 hover:border-[#3B82F6]/20 hover:shadow-md",
                    hasAnySignificantMatch && !isSignificantMatch(item) && "opacity-40 grayscale-[0.2]"
                  )}
                >
                  <div className="flex items-start gap-3 mb-3">
                    <div className="w-8 h-8 rounded-full bg-[#3B82F6]/10 dark:bg-[#3B82F6]/20 flex items-center justify-center text-[#3B82F6] group-hover:bg-[#3B82F6] group-hover:text-white transition-all shrink-0">
                      <Play size={14} fill="currentColor" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-bold truncate text-black/80 dark:text-white/80 mb-1.5">{item.text}</p>
                      <div className="flex items-center gap-2">
                        {isStrongMatch(item) && (
                          <div className="flex items-center gap-1 bg-[#3B82F6] text-white text-[7px] font-bold px-1 py-0.5 rounded uppercase tracking-wider">
                            <Sparkles size={7} />
                            Strong Match
                          </div>
                        )}
                        {item.similarity !== undefined && (
                          <p className={cn(
                            "text-[9px] font-bold uppercase tracking-tighter px-1 rounded inline-block",
                            isStrongMatch(item) ? "bg-[#3B82F6] text-white" : "text-[#3B82F6] dark:text-[#60A5FA]"
                          )}>
                            {Math.round(item.similarity * 100)}% Match
                          </p>
                        )}
                      </div>
                    </div>
                    <button 
                      onClick={(e) => handleDeleteItem(item.id, e)}
                      onKeyDown={(e) => e.stopPropagation()}
                      className="opacity-0 group-hover:opacity-40 hover:!opacity-100 text-red-500 transition-all p-1.5 hover:bg-red-50 rounded-lg focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:outline-none"
                      aria-label={`Delete item: ${item.text}`}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                  
                  {item.similarity !== undefined && (
                    <div className="mt-1 mb-3 h-0.5 w-full bg-black/5 dark:bg-white/10 rounded-full overflow-hidden">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${item.similarity * 100}%` }}
                        className="h-full bg-[#3B82F6]"
                      />
                    </div>
                  )}

                  {/* Mock Waveform */}
                  <div className="flex items-end gap-0.5 h-6 opacity-5 dark:opacity-20 group-hover:opacity-20 dark:group-hover:opacity-40 transition-opacity">
                    {Array.from({ length: 40 }).map((_, i) => (
                      <motion.div 
                        key={i}
                        animate={{ height: [2, Math.random() * 18 + 2, 2] }}
                        transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.03 }}
                        className="flex-1 bg-black dark:bg-white rounded-full"
                      />
                    ))}
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </main>
      </div>

      {/* Item Inspector Modal */}
      <AnimatePresence>
        {selectedItem && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] bg-black/5 dark:bg-black/60 backdrop-blur-md flex items-center justify-center p-6"
            onClick={() => setSelectedItem(null)}
            role="dialog"
            aria-modal="true"
            aria-labelledby="inspector-title"
          >
            <FocusLock returnFocus>
              <motion.div
                initial={{ scale: 0.95, y: 10 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.95, y: 10 }}
                className="bg-white dark:bg-[#1A1A1A] border border-black/5 dark:border-white/10 shadow-2xl rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto md:overflow-hidden flex flex-col md:flex-row"
                onClick={e => e.stopPropagation()}
              >
                {/* Preview Side */}
                <div className="w-full md:w-1/2 bg-black/[0.01] dark:bg-white/[0.01] p-4 md:p-8 flex items-center justify-center border-b md:border-b-0 md:border-r border-black/5 dark:border-white/10 min-h-[160px] md:min-h-[300px]">
                  {selectedItem.type === 'text' && (
                    <div className="text-center p-4 md:p-6">
                      <FileText size={32} className="mx-auto mb-4 md:mb-6 text-[#3B82F6] opacity-10 md:block hidden" />
                      <p className="text-lg md:text-xl font-serif italic text-black/80 dark:text-white/80 leading-relaxed">&ldquo;{selectedItem.text}&rdquo;</p>
                    </div>
                  )}
                  {selectedItem.type === 'image' && (
                    <div className="relative w-full aspect-video md:aspect-square rounded-xl overflow-hidden shadow-lg border border-black/5 dark:border-white/10 min-h-[140px] md:min-h-[200px]">
                      <Image 
                        src={`data:${selectedItem.mimeType};base64,${selectedItem.data}`} 
                        alt={selectedItem.text}
                        fill
                        className="object-cover"
                      />
                    </div>
                  )}
                  {selectedItem.type === 'audio' && (
                    <div className="text-center w-full p-4 md:p-6">
                      <div className="w-12 h-12 md:w-20 md:h-20 bg-[#3B82F6] rounded-full flex items-center justify-center mx-auto mb-4 md:mb-8 shadow-lg shadow-[#3B82F6]/20">
                        <Music size={20} className="md:size-32 text-white" />
                      </div>
                      <audio 
                        controls 
                        src={`data:${selectedItem.mimeType};base64,${selectedItem.data}`}
                        className="w-full h-10"
                        autoPlay
                      />
                    </div>
                  )}
                </div>

                {/* Info Side */}
                <div className="w-full md:w-1/2 p-6 md:p-8 flex flex-col">
                  <div className="flex justify-between items-start mb-6">
                    <div>
                      <h3 className="text-[9px] font-bold uppercase tracking-widest opacity-30 dark:opacity-50 mb-1 dark:text-white">Inspector</h3>
                      <h2 id="inspector-title" className="text-xl font-bold text-black/90 dark:text-white/90">{selectedItem.text}</h2>
                    </div>
                    <button 
                      onClick={() => setSelectedItem(null)}
                      className="p-1.5 hover:bg-black/5 dark:hover:bg-white/10 rounded-lg transition-colors text-black/20 dark:text-white/20 hover:text-black dark:hover:text-white focus-visible:ring-2 focus-visible:ring-[#3B82F6] focus-visible:outline-none"
                      aria-label="Close inspector"
                    >
                      <X size={16} />
                    </button>
                  </div>

                <div className="space-y-6 flex-1">
                  {seedItem && selectedItem.id !== seedItem.id && (
                    <div className="p-4 bg-[#3B82F6]/5 dark:bg-[#3B82F6]/10 border border-[#3B82F6]/10 rounded-xl">
                      <div className="flex items-center gap-2 mb-2">
                        <Zap size={12} className="text-[#3B82F6]" />
                        <span className="text-[10px] font-bold uppercase tracking-wider text-[#3B82F6]">Similarity Context</span>
                      </div>
                      <p className="text-[11px] text-black/60 dark:text-white/60 leading-relaxed">
                        This item has a <span className="font-bold text-[#3B82F6]">{Math.round((selectedItem.similarity || 0) * 100)}%</span> similarity to your current seed. 
                        The vector embeddings share common conceptual features in the latent space.
                      </p>
                      <p className="text-[10px] text-black/40 dark:text-white/40 leading-relaxed mt-2 italic">
                        Note: Due to the high density of information in images and audio compared to text, the model perceives these formats with different levels of detail. This means that similarity scores between different media types can be lower, even when the items are conceptually related.
                      </p>
                    </div>
                  )}
                  <div>
                    <div className="flex justify-between items-end mb-3">
                      <h4 className="text-[9px] font-bold uppercase tracking-widest opacity-30 dark:opacity-50 dark:text-white">Embedding Vector</h4>
                      <div className="flex items-center gap-2">
                        <span className="text-[8px] font-mono opacity-20 dark:opacity-40 dark:text-white">{selectedItem.embedding?.length || 768}-DIM</span>
                        <button 
                          onClick={handleCopyEmbedding}
                          className="p-1 hover:bg-black/5 dark:hover:bg-white/10 rounded text-black/40 dark:text-white/40 hover:text-[#3B82F6] transition-all"
                          title="Copy Full Embedding"
                        >
                          {copied ? <Check size={10} className="text-green-500" /> : <Copy size={10} />}
                        </button>
                      </div>
                    </div>
                    <div className="p-4 bg-black/[0.02] dark:bg-white/[0.02] rounded-xl border border-black/5 dark:border-white/10 font-mono text-[10px] space-y-2">
                      <div className="break-all leading-relaxed">
                        <span className="text-[#3B82F6] font-bold">
                          {Array.isArray(selectedItem.embedding) ? (
                            `[${selectedItem.embedding.slice(0, 4).map(v => v.toFixed(4)).join(', ')} ... ${selectedItem.embedding.slice(-4).map(v => v.toFixed(4)).join(', ')}]`
                          ) : (
                            '[Vector data unavailable]'
                          )}
                        </span>
                      </div>
                    </div>
                    <p className="text-[9px] font-medium opacity-30 dark:opacity-50 mt-2 italic dark:text-white">Displaying truncated vector representation.</p>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 bg-black/[0.01] dark:bg-white/[0.01] rounded-xl border border-black/5 dark:border-white/10">
                      <p className="text-[9px] font-bold uppercase opacity-30 dark:opacity-50 mb-1 dark:text-white">Modality</p>
                      <p className="text-[11px] font-bold capitalize">{selectedItem.type}</p>
                    </div>
                    <div className="p-3 bg-black/[0.01] dark:bg-white/[0.01] rounded-xl border border-black/5 dark:border-white/10">
                      <p className="text-[9px] font-bold uppercase opacity-30 dark:opacity-50 mb-1 dark:text-white">ID</p>
                      <p className="text-[11px] font-bold truncate">{selectedItem.id.split('-')[0]}</p>
                    </div>
                  </div>
                </div>

                <div className="mt-8 pt-6 border-t border-black/5 dark:border-white/10">
                  <button 
                    onClick={() => {
                      setSeedItem(selectedItem);
                      setSelectedItem(null);
                      if (selectedItem.embedding) {
                        triggerSearch(selectedItem.embedding);
                      }
                    }}
                    className="w-full bg-black dark:bg-white text-white dark:text-black py-3 rounded-xl font-bold text-xs hover:bg-[#3B82F6] dark:hover:bg-[#3B82F6] dark:hover:text-white transition-all shadow-sm focus-visible:ring-2 focus-visible:ring-[#3B82F6] focus-visible:outline-none flex items-center justify-center gap-2"
                  >
                    <Zap size={14} />
                    Set as Search Seed
                  </button>
                </div>
              </div>
            </motion.div>
          </FocusLock>
        </motion.div>
      )}
    </AnimatePresence>

      {/* Search Upload Modal */}
      <AnimatePresence>
        {isSearchUploadModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[120] bg-black/20 dark:bg-black/60 backdrop-blur-md flex items-center justify-center p-6"
            onClick={() => setIsSearchUploadModalOpen(false)}
            role="dialog"
            aria-modal="true"
            aria-labelledby="search-modal-title"
          >
            <FocusLock returnFocus>
              <motion.div
                initial={{ scale: 0.95, y: 10 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.95, y: 10 }}
                className="bg-white dark:bg-[#1A1A1A] border border-black/5 dark:border-white/10 shadow-2xl rounded-2xl max-w-md w-full p-8"
                onClick={e => e.stopPropagation()}
              >
                <div className="flex justify-between items-center mb-6">
                  <h2 id="search-modal-title" className="text-lg font-bold text-black dark:text-white">Multimodal Search</h2>
                  <button 
                    onClick={() => setIsSearchUploadModalOpen(false)} 
                    className="text-black/20 dark:text-white/20 hover:text-black dark:hover:text-white focus-visible:ring-2 focus-visible:ring-[#3B82F6] focus-visible:outline-none rounded"
                    aria-label="Close search modal"
                  >
                    <X size={18} />
                  </button>
                </div>

              <div className="space-y-6">
                <div className="space-y-1">
                  <p className="text-xs text-black/60 dark:text-white/60 leading-relaxed">
                    Upload an image (JPG, PNG) or audio file (MP3, WAV) to find conceptually similar items in the dataset.
                  </p>
                  <div className="bg-black/[0.02] dark:bg-white/[0.02] border border-black/5 dark:border-white/10 rounded-lg p-2 space-y-1">
                    <p className="text-[9px] text-black/40 dark:text-white/40 leading-tight">
                      <span className="font-bold">Images:</span> Supported formats: PNG, JPEG
                    </p>
                    <p className="text-[9px] text-black/40 dark:text-white/40 leading-tight">
                      <span className="font-bold">Audio:</span> Max 80s, support format: MP3, WAV
                    </p>
                    <p className="text-[9px] text-black/40 dark:text-white/40 leading-tight">
                      <span className="font-bold">Max Input Tokens:</span> 8192 tokens
                    </p>
                  </div>
                </div>

                {fileError && (
                  <div className="p-3 bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/20 rounded-xl flex items-center gap-2 text-red-600 dark:text-red-400">
                    <Info size={14} />
                    <span className="text-[10px] font-bold uppercase tracking-wider">{fileError}</span>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <button 
                    onClick={() => {
                      setFileError(null);
                      imageInputRef.current?.click();
                    }}
                    className="flex flex-col items-center justify-center gap-3 p-6 bg-black/[0.02] dark:bg-white/[0.02] border border-dashed border-black/10 dark:border-white/10 rounded-2xl hover:bg-[#3B82F6]/5 dark:hover:bg-[#3B82F6]/10 hover:border-[#3B82F6]/40 dark:hover:border-[#3B82F6]/40 transition-all group"
                  >
                    <ImageIcon size={24} className="text-black/20 dark:text-white/20 group-hover:text-[#3B82F6]" />
                    <span className="text-[10px] font-bold uppercase tracking-wider text-black/60 dark:text-white/60">Upload Image</span>
                  </button>
                  <button 
                    onClick={() => {
                      setFileError(null);
                      audioInputRef.current?.click();
                    }}
                    className="flex flex-col items-center justify-center gap-3 p-6 bg-black/[0.02] dark:bg-white/[0.02] border border-dashed border-black/10 dark:border-white/10 rounded-2xl hover:bg-[#3B82F6]/5 dark:hover:bg-[#3B82F6]/10 hover:border-[#3B82F6]/40 dark:hover:border-[#3B82F6]/40 transition-all group"
                  >
                    <Music size={24} className="text-black/20 dark:text-white/20 group-hover:text-[#3B82F6]" />
                    <span className="text-[10px] font-bold uppercase tracking-wider text-black/60 dark:text-white/60">Upload Audio</span>
                  </button>
                </div>

                <p className="text-[10px] text-black/40 dark:text-white/40 text-center leading-relaxed">
                  By using this feature, you confirm that you have the necessary rights to any content that you upload. Do not generate content that infringes on others’ intellectual property or privacy rights. Your use of this generative AI service is subject to our Prohibited Use Policy.
                </p>
              </div>
            </motion.div>
          </FocusLock>
        </motion.div>
      )}
    </AnimatePresence>

      {/* Add New Modal */}
      <AnimatePresence>
        {isAddModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[120] bg-black/20 dark:bg-black/60 backdrop-blur-md flex items-center justify-center p-6"
            onClick={() => setIsAddModalOpen(false)}
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-modal-title"
          >
            <FocusLock returnFocus>
              <motion.div
                initial={{ scale: 0.95, y: 10 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.95, y: 10 }}
                className="bg-white dark:bg-[#1A1A1A] border border-black/5 dark:border-white/10 shadow-2xl rounded-2xl max-w-md w-full p-8"
                onClick={e => e.stopPropagation()}
              >
                <div className="flex justify-between items-center mb-6">
                  <h2 id="add-modal-title" className="text-lg font-bold text-black dark:text-white">Add New Embedding</h2>
                  <button 
                    onClick={() => setIsAddModalOpen(false)} 
                    className="text-black/20 dark:text-white/20 hover:text-black dark:hover:text-white focus-visible:ring-2 focus-visible:ring-[#3B82F6] focus-visible:outline-none rounded"
                    aria-label="Close add modal"
                  >
                    <X size={18} />
                  </button>
                </div>

              <div className="space-y-6">
                {fileError && (
                  <div className="p-3 bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/20 rounded-xl flex items-center gap-2 text-red-600 dark:text-red-400">
                    <Info size={14} />
                    <span className="text-[10px] font-bold uppercase tracking-wider">{fileError}</span>
                  </div>
                )}
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider opacity-40 dark:opacity-50 mb-2 block dark:text-white">Text Embedding</label>
                  <div className="flex gap-2">
                    <input 
                      type="text"
                      value={newText}
                      onChange={(e) => setNewText(e.target.value)}
                      placeholder="Enter text to embed..."
                      className="flex-1 bg-black/[0.03] dark:bg-white/[0.03] border border-black/5 dark:border-white/10 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-[#3B82F6]/40 dark:focus:border-[#3B82F6]/40 placeholder:text-black/50 dark:placeholder:text-white/50 text-black dark:text-white"
                      onKeyDown={(e) => e.key === 'Enter' && handleAddText(newText)}
                    />
                    <button 
                      onClick={() => handleAddText(newText)}
                      className="px-4 bg-black dark:bg-white text-white dark:text-black rounded-xl text-[10px] font-bold hover:bg-[#3B82F6] dark:hover:bg-[#3B82F6] dark:hover:text-white transition-all"
                    >
                      Add
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <button 
                    onClick={() => {
                      setFileError(null);
                      imageInputRef.current?.click();
                    }}
                    className="flex flex-col items-center justify-center gap-3 p-6 bg-black/[0.02] dark:bg-white/[0.02] border border-dashed border-black/10 dark:border-white/10 rounded-2xl hover:bg-[#3B82F6]/5 dark:hover:bg-[#3B82F6]/10 hover:border-[#3B82F6]/40 dark:hover:border-[#3B82F6]/40 transition-all group"
                  >
                    <ImageIcon size={24} className="text-black/20 dark:text-white/20 group-hover:text-[#3B82F6]" />
                    <span className="text-[10px] font-bold uppercase tracking-wider text-black/60 dark:text-white/60">Upload Image</span>
                  </button>
                  <button 
                    onClick={() => {
                      setFileError(null);
                      audioInputRef.current?.click();
                    }}
                    className="flex flex-col items-center justify-center gap-3 p-6 bg-black/[0.02] dark:bg-white/[0.02] border border-dashed border-black/10 dark:border-white/10 rounded-2xl hover:bg-[#3B82F6]/5 dark:hover:bg-[#3B82F6]/10 hover:border-[#3B82F6]/40 dark:hover:border-[#3B82F6]/40 transition-all group"
                  >
                    <Music size={24} className="text-black/20 dark:text-white/20 group-hover:text-[#3B82F6]" />
                    <span className="text-[10px] font-bold uppercase tracking-wider text-black/60 dark:text-white/60">Upload Audio</span>
                  </button>
                </div>

                <p className="text-[10px] text-black/40 dark:text-white/40 text-center leading-relaxed">
                  By using this feature, you confirm that you have the necessary rights to any content that you upload. Do not generate content that infringes on others’ intellectual property or privacy rights. Your use of this generative AI service is subject to our Prohibited Use Policy.
                </p>

                <div className="pt-4 border-t border-black/5 dark:border-white/10 space-y-3">
                  <div className="bg-black/[0.02] dark:bg-white/[0.02] border border-black/5 dark:border-white/10 rounded-lg p-2 space-y-1">
                    <p className="text-[9px] text-black/40 dark:text-white/40 leading-tight">
                      <span className="font-bold">Images:</span> Supported formats: PNG, JPEG
                    </p>
                    <p className="text-[9px] text-black/40 dark:text-white/40 leading-tight">
                      <span className="font-bold">Audio:</span> Max 80s, support format: MP3, WAV
                    </p>
                    <p className="text-[9px] text-black/40 dark:text-white/40 leading-tight">
                      <span className="font-bold">Max Input Tokens:</span> 8192 tokens
                    </p>
                  </div>
                  <p className="text-[10px] text-black/40 dark:text-white/40 text-center leading-relaxed">
                    New items will be processed by Gemini and added to your local library for cross-modal search.
                  </p>
                </div>
              </div>
            </motion.div>
          </FocusLock>
        </motion.div>
      )}
    </AnimatePresence>

      {/* About Modal */}
      <AnimatePresence>
        {isAboutOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[130] bg-black/40 dark:bg-black/80 backdrop-blur-md flex items-center justify-center p-6"
            onClick={() => setIsAboutOpen(false)}
            role="dialog"
            aria-modal="true"
            aria-labelledby="about-modal-title"
          >
            <FocusLock returnFocus>
              <motion.div
                initial={{ scale: 0.95, y: 10 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.95, y: 10 }}
                className="bg-white dark:bg-[#1A1A1A] border border-black/5 dark:border-white/10 shadow-2xl rounded-2xl max-w-lg w-full p-6 md:p-10 max-h-[90vh] overflow-y-auto"
                onClick={e => e.stopPropagation()}
              >
                <div className="flex justify-between items-center mb-8">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-[#3B82F6] rounded-xl flex items-center justify-center text-white">
                      <Sparkles size={20} />
                    </div>
                    <div>
                      <h2 id="about-modal-title" className="text-xl font-bold text-black dark:text-white">About Multimodal Search</h2>
                      <p className="text-[10px] font-bold text-[#3B82F6] uppercase tracking-widest">Gemini Embedding 2</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setIsAboutOpen(false)} 
                    className="text-black/20 dark:text-white/20 hover:text-black dark:hover:text-white focus-visible:ring-2 focus-visible:ring-[#3B82F6] focus-visible:outline-none rounded"
                    aria-label="Close about modal"
                  >
                    <X size={20} />
                  </button>
                </div>

              <div className="space-y-6 text-sm leading-relaxed text-black/70 dark:text-white/70">
                <p>
                  This application demonstrates the power of <span className="font-bold text-black dark:text-white">Multimodal Embeddings</span>. Unlike traditional search which relies on keywords, this system understands the <span className="italic">conceptual meaning</span> of data across different formats.
                </p>

                <p>
                  You can search by typing a concept, or uploading an image or audio. The system calculates the <span className="font-bold text-black dark:text-white">Cosine Similarity</span> between your search &quot;seed&quot; and the library to find the best matches.
                </p>                   

                <div className="grid grid-cols-1 gap-4">

                  <div className="p-4 bg-black/[0.02] dark:bg-white/[0.02] rounded-xl border border-black/5 dark:border-white/10">
                    <h4 className="text-[10px] font-bold uppercase tracking-wider text-black/40 dark:text-white/40 mb-2">Supported Datatypes</h4>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {['Text', 'Images', 'Audio'].map(t => (
                        <span key={t} className="px-2 py-0.5 bg-green-500/10 text-green-600 rounded text-[9px] font-bold uppercase">{t}</span>
                      ))}
                      {['Video', 'PDF'].map(t => (
                        <div key={t} className="flex flex-col">
                          <span className="px-2 py-0.5 bg-black/5 dark:bg-white/5 text-black/30 dark:text-white/30 rounded text-[9px] font-bold uppercase">{t}</span>
                        </div>
                      ))}
                    </div>
                    <p className="text-[9px] text-black/40 dark:text-white/40 mt-3 italic font-medium">
                      * Video and PDF support is not implemented in this application.
                    </p>
                  </div>

                  <div className="p-4 bg-black/[0.02] dark:bg-white/[0.02] rounded-xl border border-black/5 dark:border-white/10">
                    <h4 className="text-[10px] font-bold uppercase tracking-wider text-black/40 dark:text-white/40 mb-2">Dataset Info</h4>
                    <ul className="text-xs space-y-1">
                      <li>• Images generated with <span className="font-medium text-black dark:text-white">Nano Banana 2</span></li>
                      <li>• Audio samples generated with <span className="font-medium text-black dark:text-white">Gemini 2.5 Pro Preview TTS</span></li>
                    </ul>
                  </div>
                </div>
              </div>

              <div className="mt-10 pt-6 border-t border-black/5 dark:border-white/10">
                <button 
                  onClick={() => setIsAboutOpen(false)}
                  className="w-full bg-black dark:bg-white text-white dark:text-black py-3 rounded-xl font-bold text-xs hover:bg-[#3B82F6] dark:hover:bg-[#3B82F6] dark:hover:text-white transition-all shadow-sm focus-visible:ring-2 focus-visible:ring-[#3B82F6] focus-visible:outline-none"
                >
                  Got it
                </button>
              </div>
            </motion.div>
          </FocusLock>
        </motion.div>
      )}
    </AnimatePresence>

      {/* Loading Overlay */}
      <AnimatePresence>
        {isLoading && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/60 dark:bg-black/80 backdrop-blur-sm flex items-center justify-center"
          >
            <div className="text-center">
              <div className="w-12 h-12 border-2 border-[#3B82F6] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="text-xs font-mono uppercase tracking-[0.3em] animate-pulse text-white">
                {isInitialLoad ? "Initializing Embeddings..." : "Calculating Embeddings..."}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
