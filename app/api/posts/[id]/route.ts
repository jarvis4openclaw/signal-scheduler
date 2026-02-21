import { NextResponse } from 'next/server';
import Database from 'better-sqlite3';
import { writeFile, unlink } from 'fs/promises';
import { join } from 'path';

const dbPath = process.env.DB_PATH || '/opt/signal-scheduler/data/scheduler.db';
const uploadDir = '/opt/signal-scheduler/uploads';

function getDb() {
  return new Database(dbPath, { readonly: false });
}

// DELETE a post
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);

  const db = getDb();
  try {
    // Get the post to check for image
    const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(id) as any;
    
    if (!post) {
      return NextResponse.json(
        { error: 'Post not found' },
        { status: 404 }
      );
    }

    // Delete associated image if exists
    if (post.image_path) {
      try {
        await unlink(post.image_path);
      } catch (err) {
        console.error('Error deleting image file:', err);
      }
    }

    // Delete the post
    db.prepare('DELETE FROM posts WHERE id = ?').run(id);
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting post:', error);
    return NextResponse.json(
      { error: 'Failed to delete post' },
      { status: 500 }
    );
  } finally {
    db.close();
  }
}

// PATCH update a post
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);

  const contentType = request.headers.get('content-type') || '';
  
  let message: string = '';
  let group_id: string = '';
  let group_name: string = '';
  let scheduled_at: string = '';
  let image_path: string | null = null;
  let keepImage = false;

  if (contentType.includes('multipart/form-data')) {
    const formData = await request.formData();
    
    message = formData.get('message') as string;
    group_id = formData.get('group_id') as string;
    group_name = formData.get('group_name') as string;
    scheduled_at = formData.get('scheduled_at') as string;
    const image = formData.get('image') as File | null;
    keepImage = formData.get('keep_image') === 'true';

    if (!message || !group_id || !scheduled_at) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Handle new image upload
    if (image && image.size > 0) {
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
    const body = await request.json();
    message = body.message;
    group_id = body.group_id;
    group_name = body.group_name || '';
    scheduled_at = body.scheduled_at;
  }

  const db = getDb();
  try {
    // Get existing post
    const existingPost = db.prepare('SELECT * FROM posts WHERE id = ?').get(id) as any;
    
    if (!existingPost) {
      return NextResponse.json(
        { error: 'Post not found' },
        { status: 404 }
      );
    }

    // Determine final image_path
    let finalImagePath = image_path;
    if (!image_path && keepImage) {
      // Keep existing image
      finalImagePath = existingPost.image_path;
    } else if (image_path && existingPost.image_path) {
      // New image uploaded, delete old one
      try {
        await unlink(existingPost.image_path);
      } catch (err) {
        console.error('Error deleting old image:', err);
      }
    } else if (!image_path && !keepImage && existingPost.image_path) {
      // No new image and not keeping old one, delete old image
      try {
        await unlink(existingPost.image_path);
      } catch (err) {
        console.error('Error deleting image:', err);
      }
      finalImagePath = null;
    }

    // scheduled_at is already in UTC ISO format from the client
    db.prepare(
      'UPDATE posts SET message = ?, group_id = ?, group_name = ?, scheduled_at = ?, image_path = ? WHERE id = ?'
    ).run(message, group_id, group_name || '', scheduled_at, finalImagePath, id);

    const updatedPost = db.prepare('SELECT * FROM posts WHERE id = ?').get(id);
    return NextResponse.json(updatedPost);
  } catch (error) {
    console.error('Error updating post:', error);
    return NextResponse.json(
      { error: 'Failed to update post' },
      { status: 500 }
    );
  } finally {
    db.close();
  }
}
