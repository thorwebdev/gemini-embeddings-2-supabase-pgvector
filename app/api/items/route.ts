import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function POST(req: Request) {
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Supabase admin client not configured' }, { status: 500 });
  }

  try {
    const { content, metadata, embedding } = await req.json();

    const { data, error } = await supabaseAdmin
      .from('items')
      .insert([
        {
          content,
          metadata,
          embedding,
        },
      ])
      .select();

    if (error) {
      console.error('Supabase insert error:', error);
      return NextResponse.json({ error: error.message, details: error }, { status: 500 });
    }

    if (!data || data.length === 0) {
      return NextResponse.json({ error: 'Failed to insert item' }, { status: 500 });
    }

    return NextResponse.json(data[0]);
  } catch (error: any) {
    console.error('Error saving item:', error);
    return NextResponse.json({ error: error.message || 'Unknown error saving item' }, { status: 500 });
  }
}

export async function GET() {
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Supabase admin client not configured' }, { status: 500 });
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('items')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json(data);
  } catch (error: any) {
    console.error('Error fetching items:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Supabase admin client not configured' }, { status: 500 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'ID is required' }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from('items')
      .delete()
      .eq('id', id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting item:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
