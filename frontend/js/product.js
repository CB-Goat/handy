/* ============================================
   Handy.xin - 产品详情页交互脚本
   ============================================ */

const API_BASE = '/api';

// 获取 URL 参数
function getParam(name) {
  return new URLSearchParams(location.search).get(name);
}

// Toast 通知
function showToast(message, type = 'success') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = `toast ${type} show`;
  setTimeout(() => toast.classList.remove('show'), 3000);
}

// 加载产品详情
async function loadProductDetail() {
  const slug = getParam('slug');
  if (!slug) {
    showError();
    return;
  }
  
  try {
    const res = await fetch(`${API_BASE}/products/${slug}`);
    const data = await res.json();
    
    if (!data.success) {
      showError();
      return;
    }
    
    renderProduct(data.product, data.messages);
  } catch (err) {
    console.error('加载产品详情失败:', err);
    showError();
  }
}

// 渲染产品详情
function renderProduct(product, messages) {
  document.getElementById('productLoading').classList.add('hidden');
  document.getElementById('productContent').classList.remove('hidden');
  
  // 设置页面标题
  document.title = `${product.name} - Handy.xin`;
  
  // 渲染媒体轮播
  const carousel = document.getElementById('mediaCarousel');
  carousel.innerHTML = `<img src="images/product-${product.slug}.jpg" alt="${product.name}" onerror="this.src='images/hero-bg.jpg'">`;
  
  // 渲染产品信息
  document.getElementById('productIcon').textContent = product.icon;
  document.getElementById('productName').textContent = product.name;
  document.getElementById('productDesc').textContent = product.description;
  
  // 渲染特性标签
  const featuresEl = document.getElementById('productFeatures');
  featuresEl.innerHTML = product.features.map(f => `<span class="feature-tag">${f}</span>`).join('');
  
  // 更新统计数
  document.getElementById('likeCount').textContent = product.like_count || 0;
  document.getElementById('shareCount').textContent = product.share_count || 0;
  document.getElementById('productMessageCount').textContent = `(${messages?.length || 0})`;
  
  // 绑定点赞按钮
  document.getElementById('likeBtn').onclick = () => likeProduct(product.id);
  document.getElementById('shareBtn').onclick = () => shareProduct(product.id, product.slug);
  
  // 渲染留言列表
  renderMessages(messages);
  
  // 绑定留言表单
  initMessageForm(product.id);
}

// 渲染留言列表
function renderMessages(messages) {
  const listEl = document.getElementById('productMessageList');
  if (!messages?.length) {
    listEl.innerHTML = '<p style="text-align:center;color:#999;padding:20px;">暂无留言</p>';
    return;
  }
  
  const colors = ['#FF6B35', '#4ECDC4', '#FFE66D', '#95E1D3', '#F38181'];
  
  listEl.innerHTML = messages.map(m => {
    const color = colors[m.name.charCodeAt(0) % colors.length];
    const initial = m.name.charAt(0).toUpperCase();
    const time = new Date(m.created_at).toLocaleString('zh-CN', {
      month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });
    
    return `
      <div class="message-item">
        <div class="message-item-header">
          <div class="message-avatar" style="background: ${color}">${initial}</div>
          <span class="message-item-name">${escapeHTML(m.name)}</span>
          <span class="message-item-time">${time}</span>
        </div>
        <div class="message-item-content">${escapeHTML(m.content)}</div>
      </div>`;
  }).join('');
}

// 点赞
async function likeProduct(id) {
  try {
    const res = await fetch(`${API_BASE}/products/${id}/like`, { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      document.getElementById('likeCount').textContent = data.count;
      showToast(data.liked ? '点赞成功！' : '已取消点赞');
    }
  } catch {
    showToast('操作失败', 'error');
  }
}

// 分享
async function shareProduct(id, slug) {
  const url = `${location.origin}/product.html?slug=${slug}`;
  
  try {
    await navigator.clipboard.writeText(url);
    showToast('链接已复制！');
  } catch {
    showToast(url);
  }
  
  try {
    await fetch(`${API_BASE}/products/${id}/share`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ platform: 'copy' })
    });
    const countEl = document.getElementById('shareCount');
    countEl.textContent = parseInt(countEl.textContent) + 1;
  } catch {}
}

// 初始化留言表单
function initMessageForm(productId) {
  const form = document.getElementById('productMessageForm');
  form.onsubmit = async (e) => {
    e.preventDefault();
    
    const name = document.getElementById('msgName').value.trim();
    const content = document.getElementById('msgContent').value.trim();
    
    if (!name || !content) {
      showToast('请填写昵称和留言内容', 'error');
      return;
    }
    
    try {
      const res = await fetch(`${API_BASE}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_id: productId, name, content })
      });
      
      const data = await res.json();
      if (data.success) {
        showToast('留言成功！');
        form.reset();
        // 重新加载产品详情以更新留言列表
        loadProductDetail();
      } else {
        showToast(data.error || '提交失败', 'error');
      }
    } catch {
      showToast('网络错误', 'error');
    }
  };
}

// 显示错误
function showError() {
  document.getElementById('productLoading').classList.add('hidden');
  document.getElementById('productError').classList.remove('hidden');
}

// 工具函数
function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// 初始化
document.addEventListener('DOMContentLoaded', loadProductDetail);
