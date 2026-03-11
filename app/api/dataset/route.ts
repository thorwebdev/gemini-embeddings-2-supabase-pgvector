import { NextResponse } from 'next/server';

const imageUrls = [
  "https://www.gstatic.com/aistudio/starter-apps/multimodal-search/images/puppy.png",
  "https://www.gstatic.com/aistudio/starter-apps/multimodal-search/images/pizza.png",
  "https://www.gstatic.com/aistudio/starter-apps/multimodal-search/images/newyork.png",
  "https://www.gstatic.com/aistudio/starter-apps/multimodal-search/images/mountain.png",
  "https://www.gstatic.com/aistudio/starter-apps/multimodal-search/images/latte.png",
  "https://www.gstatic.com/aistudio/starter-apps/multimodal-search/images/kitten.png",
  "https://www.gstatic.com/aistudio/starter-apps/multimodal-search/images/forest.png",
  "https://www.gstatic.com/aistudio/starter-apps/multimodal-search/images/bird.png",
  "https://www.gstatic.com/aistudio/starter-apps/multimodal-search/images/bananas.png",
  "https://www.gstatic.com/aistudio/starter-apps/multimodal-search/images/apple.png"
];

const audioUrls = [
  "https://www.gstatic.com/aistudio/starter-apps/multimodal-search/audio/trees.wav",
  "https://www.gstatic.com/aistudio/starter-apps/multimodal-search/audio/traffic.wav",
  "https://www.gstatic.com/aistudio/starter-apps/multimodal-search/audio/pizza_order.wav",
  "https://www.gstatic.com/aistudio/starter-apps/multimodal-search/audio/summit.wav",
  "https://www.gstatic.com/aistudio/starter-apps/multimodal-search/audio/dog.wav",
  "https://www.gstatic.com/aistudio/starter-apps/multimodal-search/audio/coffee_beans.wav",
  "https://www.gstatic.com/aistudio/starter-apps/multimodal-search/audio/cat_purring.wav",
  "https://www.gstatic.com/aistudio/starter-apps/multimodal-search/audio/birds.wav",
  "https://www.gstatic.com/aistudio/starter-apps/multimodal-search/audio/bananas_snack.wav",
  "https://www.gstatic.com/aistudio/starter-apps/multimodal-search/audio/apple_crunch.wav"
];

async function fetchFile(url: string, type: string) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch ${url}`);
    const buffer = await res.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');
    const contentType = res.headers.get('content-type') || (type === 'image' ? 'image/png' : 'audio/wav');
    
    return {
      name: url.split('/').pop() || 'file',
      type,
      data: base64,
      mimeType: contentType
    };
  } catch (error) {
    console.error(`Error fetching ${url}:`, error);
    return null;
  }
}

export async function GET() {
  try {
    const imageFiles = await Promise.all(imageUrls.map(url => fetchFile(url, 'image')));
    const audioFiles = await Promise.all(audioUrls.map(url => fetchFile(url, 'audio')));
    
    const allFiles = [...imageFiles, ...audioFiles].filter(file => file !== null);
    
    return NextResponse.json(allFiles);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to load dataset' }, { status: 500 });
  }
}
