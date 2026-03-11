import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function POST(req: Request) {
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Supabase admin client not configured' }, { status: 500 });
  }

  try {
    const { embedding, match_threshold = 0.5, match_count = 10 } = await req.json();

    const { data, error } = await supabaseAdmin.rpc('match_items', {
      query_embedding: embedding,
      match_threshold,
      match_count,
    });

    if (error) throw error;

    return NextResponse.json(data);
  } catch (error: any) {
    console.error('Error searching items:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
