import { NextResponse } from 'next/server';

const SIGNAL_API_URL = process.env.SIGNAL_API_URL || 'http://localhost:8080';
const SIGNAL_NUMBER = process.env.SIGNAL_NUMBER || '+17025768110';

export async function GET() {
  try {
    const response = await fetch(`${SIGNAL_API_URL}/v1/groups/${SIGNAL_NUMBER}`);
    if (!response.ok) {
      throw new Error(`Signal API error: ${response.statusText}`);
    }

    const data = await response.json();

    // Extract group info
    const groups = data.map((group: any) => ({
      id: group.id,
      internal_id: group.internal_id,
      name: group.name || 'Unnamed Group',
      description: group.description || '',
    }));

    return NextResponse.json(groups);
  } catch (error) {
    console.error('Error fetching groups:', error);
    return NextResponse.json(
      { error: 'Failed to fetch groups' },
      { status: 500 }
    );
  }
}
