import { NextResponse } from 'next/server';
import Database from 'better-sqlite3';
import { writeFile } from 'fs/promises';
import { join } from 'path';

const dbPath = process.env.DB_PATH || '/opt/signal-scheduler/data/scheduler.db';
const uploadDir = '/opt/signal-scheduler/uploads';

function getDb() {
  return new Database(dbPath, { readonly: false });
}

// GET all posts
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status');

  const db = getDb();
  try {
    let query = 'SELECT * FROM posts ORDER BY scheduled_at ASC';
    const params: any[] = [];

    if (status) {
      query = 'SELECT * FROM posts WHERE status = ? ORDER BY scheduled_at ASC';
      params.push(status);
    }

    const posts = db.prepare(query).all(...params);
    return NextResponse.json(posts);
  } catch (error) {
    console.error('Error fetching posts:', error);
    return NextResponse.json(
      { error: 'Failed to fetch posts' },
      { status: 500 }
    );
  } finally {
    db.close();
  }
}

// POST create a new post
export async function POST(request: Request) {
  const contentType = request.headers.get('content-type') || '';

  let message: string = '';
  let group_id: string = '';
  let group_name: string = '';
  let scheduled_at: string = '';
  let image_path: string | null = null;

  if (contentType.includes('multipart/form-data')) {
    // Handle file upload
    const formData = await request.formData();

    message = formData.get('message') as string;
    group_id = formData.get('group_id') as string;
    group_name = formData.get('group_name') as string;
    scheduled_at = formData.get('scheduled_at') as string;
    const image = formData.get('image') as File | null;

    if (!message || !group_id || !scheduled_at) {
      return NextResponse.json(
        { error: 'Missing required fields: message, group_id, scheduled_at' },
        { status: 400 }
      );
    }

    if (image && image.size > 0) {
      // Save the image file
      const bytes = await image.arrayBuffer();
      const buffer = Buffer.from(bytes);
      const timestamp = Date.now();
      const extension = image.name.split('.').pop();
      const filename = `${timestamp}.${extension}`;
      const filepath = join(uploadDir, filename);

      await writeFile(filepath, buffer);
      image_path = filepath;
    }
  } else {
    // Handle JSON request
    const body = await request.json();
    message = body.message;
    group_id = body.group_id;
    group_name = body.group_name || '';
    scheduled_at = body.scheduled_at;

    if (!message || !group_id || !scheduled_at) {
      return NextResponse.json(
        { error: 'Missing required fields: message, group_id, scheduled_at' },
        { status: 400 }
      );
    }
  }

  // scheduled_at is already in UTC ISO format from the client
  const db = getDb();
  try {
    const result = db.prepare(
      'INSERT INTO posts (message, group_id, group_name, scheduled_at, status, image_path) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(message, group_id, group_name || '', scheduled_at, 'scheduled', image_path);

    const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(result.lastInsertRowid);
    return NextResponse.json(post, { status: 201 });
  } catch (error) {
    console.error('Error creating post:', error);
    return NextResponse.json(
      { error: 'Failed to create post' },
      { status: 500 }
    );
  } finally {
    db.close();
  }
}
