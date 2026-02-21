'use client';

import { useState, useEffect } from 'react';

interface Group {
  id: string;
  internal_id: string;
  name: string;
  description: string;
}

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

const TIMEZONE = 'America/Chicago';

type TabType = 'scheduled' | 'sent' | 'failed';

// Helper: Convert datetime-local value to UTC ISO string
// The datetime-local input gives us time in the user's LOCAL timezone (CST)
// We need to convert it to UTC for storage
function localToUTC(localDatetimeString: string): string {
  // datetime-local format: "2026-02-21T13:00"
  // This represents 1:00 PM in the user's local timezone
  const localDate = new Date(localDatetimeString);
  return localDate.toISOString();
}

// Helper: Convert UTC ISO string to datetime-local format
// The datetime-local input expects time in the user's LOCAL timezone
function utcToLocal(utcIsoString: string): string {
  const date = new Date(utcIsoString);
  
  // Format for datetime-local: YYYY-MM-DDTHH:mm
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

export default function Home() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [activeTab, setActiveTab] = useState<TabType>('scheduled');
  const [formData, setFormData] = useState({
    message: '',
    group_id: '',
    scheduled_at: '',
  });
  const [image, setImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [editingPost, setEditingPost] = useState<Post | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);

  useEffect(() => {
    fetchGroups();
    fetchPosts();
  }, []);

  const fetchGroups = async () => {
    const res = await fetch('/api/groups');
    const data = await res.json();
    setGroups(data);
  };

  const fetchPosts = async () => {
    const res = await fetch('/api/posts');
    const data = await res.json();
    setPosts(data);
  };

  const getFilteredPosts = () => {
    return posts.filter(post => post.status === activeTab);
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImage(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;

    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];

      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();

        if (file) {
          // Validate file size (max 10MB)
          if (file.size > 10 * 1024 * 1024) {
            alert('Image too large. Maximum size is 10MB.');
            e.preventDefault();
            return;
          }

          setImage(file);

          const reader = new FileReader();
          reader.onloadend = () => {
            setImagePreview(reader.result as string);
          };
          reader.readAsDataURL(file);

          e.preventDefault();
          return;
        }
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const submitFormData = new FormData();
    submitFormData.append('message', formData.message);
    submitFormData.append('group_id', formData.group_id);
    submitFormData.append('group_name', groups.find(g => g.id === formData.group_id)?.name || '');
    
    // Convert local time to UTC before sending
    const utcTime = localToUTC(formData.scheduled_at);
    submitFormData.append('scheduled_at', utcTime);
    
    if (image) {
      submitFormData.append('image', image);
    }

    const res = await fetch('/api/posts', {
      method: 'POST',
      body: submitFormData,
    });

    if (res.ok) {
      setFormData({ message: '', group_id: '', scheduled_at: '' });
      setImage(null);
      setImagePreview('');
      fetchPosts();
    }

    setLoading(false);
  };

  const deletePost = async (id: number) => {
    if (!confirm('Delete this post?')) return;

    const res = await fetch(`/api/posts/${id}`, { method: 'DELETE' });
    if (res.ok) {
      fetchPosts();
    }
  };

  const openEditModal = (post: Post) => {
    if (post.status !== 'scheduled') {
      alert('Can only edit scheduled posts.');
      return;
    }

    setEditingPost(post);
    setShowEditModal(true);

    // Convert UTC time to local for the form
    const localTime = utcToLocal(post.scheduled_at);
    setFormData({
      message: post.message,
      group_id: post.group_id,
      scheduled_at: localTime,
    });
    setImage(null);
    setImagePreview('');
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPost) return;

    setLoading(true);

    const submitFormData = new FormData();
    submitFormData.append('message', formData.message);
    submitFormData.append('group_id', formData.group_id);
    submitFormData.append('group_name', groups.find(g => g.id === formData.group_id)?.name || '');
    
    // Convert local time to UTC before sending
    const utcTime = localToUTC(formData.scheduled_at);
    submitFormData.append('scheduled_at', utcTime);
    
    if (image) {
      submitFormData.append('image', image);
    } else if (!imagePreview && editingPost.image_path) {
      submitFormData.append('keep_image', 'true');
    }

    const res = await fetch(`/api/posts/${editingPost.id}`, {
      method: 'PATCH',
      body: submitFormData,
    });

    if (res.ok) {
      setShowEditModal(false);
      setEditingPost(null);
      setFormData({ message: '', group_id: '', scheduled_at: '' });
      setImage(null);
      setImagePreview('');
      fetchPosts();
    }

    setLoading(false);
  };

  const formatDateTime = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleString('en-US', {
      timeZone: TIMEZONE,
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Get default datetime (now + 1 hour, in local time)
  const getDefaultDateTime = () => {
    const now = new Date();
    now.setHours(now.getHours() + 1);
    
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  };

  const filteredPosts = getFilteredPosts();

  return (
    <main className="min-h-screen bg-gray-50 flex">
      {/* Left Sidebar Navigation */}
      <div className="w-64 bg-white shadow-lg">
        <div className="p-6 border-b">
          <h1 className="text-2xl font-bold">Signal Scheduler</h1>
        </div>
        <nav className="p-4">
          <button
            onClick={() => setActiveTab('scheduled')}
            className={`w-full text-left px-4 py-3 rounded-lg mb-2 font-medium transition-colors ${
              activeTab === 'scheduled'
                ? 'bg-blue-600 text-white'
                : 'text-gray-700 hover:bg-gray-100'
            }`}
          >
            📅 Scheduled
          </button>
          <button
            onClick={() => setActiveTab('sent')}
            className={`w-full text-left px-4 py-3 rounded-lg mb-2 font-medium transition-colors ${
              activeTab === 'sent'
                ? 'bg-blue-600 text-white'
                : 'text-gray-700 hover:bg-gray-100'
            }`}
          >
            ✅ Sent
          </button>
          <button
            onClick={() => setActiveTab('failed')}
            className={`w-full text-left px-4 py-3 rounded-lg font-medium transition-colors ${
              activeTab === 'failed'
                ? 'bg-blue-600 text-white'
                : 'text-gray-700 hover:bg-gray-100'
            }`}
          >
            ❌ Failed
          </button>
        </nav>
      </div>

      {/* Main Content */}
      <div className="flex-1 p-8">
        {/* Create Post Form */}
        <div className="bg-white rounded-lg shadow p-6 mb-8">
          <h2 className="text-xl font-semibold mb-4">Schedule New Post</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Group</label>
              <select
                value={formData.group_id}
                onChange={(e) => setFormData({ ...formData, group_id: e.target.value })}
                className="w-full border rounded px-3 py-2"
                required
              >
                <option value="">Select a group</option>
                {groups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                Message <span className="text-gray-400 text-sm">(Ctrl+V to paste images)</span>
              </label>
              <textarea
                value={formData.message}
                onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                onPaste={handlePaste}
                className="w-full border rounded px-3 py-2 h-32"
                placeholder="Type your message or paste an image directly..."
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Image (optional)</label>
              <input
                type="file"
                accept="image/*"
                onChange={handleImageChange}
                className="w-full border rounded px-3 py-2"
              />
              {imagePreview && (
                <div className="mt-2">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-gray-600">Preview:</span>
                    <button
                      type="button"
                      onClick={() => {
                        setImage(null);
                        setImagePreview('');
                      }}
                      className="text-sm text-red-600 hover:text-red-800"
                    >
                      Remove
                    </button>
                  </div>
                  <img src={imagePreview} alt="Preview" className="max-w-full h-auto rounded" style={{ maxHeight: '200px' }} />
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                Schedule Time <span className="text-gray-500 text-sm">(Your local time)</span>
              </label>
              <input
                type="datetime-local"
                value={formData.scheduled_at || getDefaultDateTime()}
                onChange={(e) => setFormData({ ...formData, scheduled_at: e.target.value })}
                className="w-full border rounded px-3 py-2"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Scheduling...' : 'Schedule Post'}
            </button>
          </form>
        </div>

        {/* Posts List */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">
            {activeTab.charAt(0).toUpperCase() + activeTab.slice(1)} Posts
          </h2>
          {filteredPosts.length === 0 ? (
            <p className="text-gray-500">No {activeTab} posts</p>
          ) : (
            <div className="space-y-3">
              {filteredPosts.map((post) => (
                <div
                  key={post.id}
                  className="border rounded p-4 flex justify-between items-start"
                >
                  <div className="flex-1">
                    <div className="font-medium">{post.group_name}</div>
                    {post.image_path && (
                      <div className="my-2">
                        <img
                          src={`/api/images/${encodeURIComponent(post.image_path.split('/').pop() || '')}`}
                          alt="Attachment"
                          className="max-w-full h-auto rounded"
                          style={{ maxHeight: '150px' }}
                        />
                      </div>
                    )}
                    <div className="text-gray-600 mt-1">{post.message}</div>
                    <div className="text-sm text-gray-500 mt-2">
                      {post.status === 'scheduled' ? (
                        <>Scheduled: {formatDateTime(post.scheduled_at)}</>
                      ) : post.status === 'sent' ? (
                        <>Sent: {post.sent_at ? formatDateTime(post.sent_at) : formatDateTime(post.scheduled_at)}</>
                      ) : (
                        <>Failed: {formatDateTime(post.scheduled_at)}</>
                      )}
                    </div>
                  </div>
                  {post.status === 'scheduled' && (
                    <div className="ml-4 flex gap-2">
                      <button
                        onClick={() => openEditModal(post)}
                        className="text-blue-600 hover:text-blue-800"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => deletePost(post.id)}
                        className="text-red-600 hover:text-red-800"
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Edit Modal */}
      {showEditModal && editingPost && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-semibold mb-4">Edit Post</h2>
            <form onSubmit={handleEditSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Group</label>
                <select
                  value={formData.group_id}
                  onChange={(e) => setFormData({ ...formData, group_id: e.target.value })}
                  className="w-full border rounded px-3 py-2"
                  required
                >
                  <option value="">Select a group</option>
                  {groups.map((group) => (
                    <option key={group.id} value={group.id}>
                      {group.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">
                  Message <span className="text-gray-400 text-sm">(Ctrl+V to paste images)</span>
                </label>
                <textarea
                  value={formData.message}
                  onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                  onPaste={handlePaste}
                  className="w-full border rounded px-3 py-2 h-32"
                  placeholder="Type your message or paste an image directly..."
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Image (optional)</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageChange}
                  className="w-full border rounded px-3 py-2"
                />
                {imagePreview && (
                  <div className="mt-2">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-gray-600">New Image Preview:</span>
                      <button
                        type="button"
                        onClick={() => {
                          setImage(null);
                          setImagePreview('');
                        }}
                        className="text-sm text-red-600 hover:text-red-800"
                      >
                        Remove
                      </button>
                    </div>
                    <img src={imagePreview} alt="Preview" className="max-w-full h-auto rounded" style={{ maxHeight: '200px' }} />
                  </div>
                )}
                {!imagePreview && editingPost.image_path && (
                  <div className="mt-2">
                    <span className="text-sm text-gray-600">Current Image:</span>
                    <img
                      src={`/api/images/${encodeURIComponent(editingPost.image_path.split('/').pop() || '')}`}
                      alt="Current"
                      className="max-w-full h-auto rounded mt-1"
                      style={{ maxHeight: '150px' }}
                    />
                    <p className="text-xs text-gray-500 mt-1">Upload a new image to replace, or leave empty to keep current</p>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">
                  Schedule Time <span className="text-gray-500 text-sm">(Your local time)</span>
                </label>
                <input
                  type="datetime-local"
                  value={formData.scheduled_at}
                  onChange={(e) => setFormData({ ...formData, scheduled_at: e.target.value })}
                  className="w-full border rounded px-3 py-2"
                  required
                />
              </div>

              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setShowEditModal(false);
                    setEditingPost(null);
                    setFormData({ message: '', group_id: '', scheduled_at: '' });
                    setImage(null);
                    setImagePreview('');
                  }}
                  className="px-4 py-2 border rounded hover:bg-gray-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
                >
                  {loading ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
