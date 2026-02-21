import Database from 'better-sqlite3';
import cron from 'node-cron';
import { readFile } from 'fs/promises';
import { promisify } from 'util';

interface Post {
  id: number;
  message: string;
  group_id: string;
  group_name: string;
  scheduled_at: string;
  status: string;
  created_at: string;
  sent_at?: string;
  image_path?: string;
}

const dbPath = process.env.DB_PATH || '/opt/signal-scheduler/data/scheduler.db';
const SIGNAL_API_URL = process.env.SIGNAL_API_URL || 'http://localhost:8080';
const SIGNAL_NUMBER = process.env.SIGNAL_NUMBER || '+17025768110';

function getDb() {
  return new Database(dbPath, { readonly: false });
}

async function sendToSignal(groupId: string, message: string, imagePath?: string) {
  try {
    const payload: any = {
      message,
      recipients: [groupId],
      number: SIGNAL_NUMBER,
    };

    if (imagePath) {
      const imageBuffer = await readFile(imagePath);
      payload.base64_attachments = [imageBuffer.toString('base64')];
    }

    const response = await fetch(`${SIGNAL_API_URL}/v2/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error(`Failed to send to group ${groupId}:`, error);
      return false;
    }

    console.log(`Sent message to group ${groupId}${imagePath ? ' with image' : ''}`);
    return true;
  } catch (error) {
    console.error(`Error sending to group ${groupId}:`, error);
    return false;
  }
}

async function processScheduledPosts() {
  const db = getDb();
  try {
    const now = new Date().toISOString();

    const posts = db.prepare(
      'SELECT * FROM posts WHERE scheduled_at <= ? AND status = ? ORDER BY scheduled_at ASC'
    ).all(now, 'scheduled') as Post[];

    if (posts.length === 0) {
      console.log('No due posts to process');
      return;
    }

    console.log(`Processing ${posts.length} due post(s)`);

    for (const post of posts) {
      console.log(`Sending post #${post.id} to group ${post.group_name}${post.image_path ? ' (with image)' : ''}`);

      const success = await sendToSignal(post.group_id, post.message, post.image_path);

      if (success) {
        db.prepare(
          'UPDATE posts SET status = ?, sent_at = ? WHERE id = ?'
        ).run('sent', new Date().toISOString(), post.id);
        console.log(`Post #${post.id} marked as sent`);
      } else {
        db.prepare(
          'UPDATE posts SET status = ? WHERE id = ?'
        ).run('failed', post.id);
        console.error(`Post #${post.id} marked as failed`);
      }
    }
  } catch (error) {
    console.error('Error processing scheduled posts:', error);
  } finally {
    db.close();
  }
}

// Run every minute
console.log('Starting Signal Scheduler...');
processScheduledPosts();

cron.schedule('* * * * *', () => {
  console.log('Running scheduled check...');
  processScheduledPosts();
});
