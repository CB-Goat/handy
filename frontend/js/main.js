/* ============================================
   Handy.xin - 主页交互脚本
   ============================================ */

const API_BASE = '/api';

// Toast 通知
function showToast(message, type = 'success') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = `toast ${type} show`;
  setTimeout(() => toast.classList.remove('show'), 3000);
}

// 导航栏滚动效果
function initNavbar() {
  const navbar = document.getElementById('navbar');
  window.addEventListener('scroll', () => {
    navbar.classList.toggle('scrolled', window.pageYOffset > 50);
  });
}

// 移动端菜单
function initMobileMenu() {
  const btn = document.getElementById('mobileMenuBtn');
  const links = document.querySelector('.nav-links');
  btn?.addEventListener('click', () => {
    links.classList.toggle('active');
    btn.classList.toggle('active');
  });
}

// 加载产品列表
async function loadProducts() {
  const container = document.getElementById('productsList');
  if (!container) return;
  
  try {
    const res = await fetch(`${API_BASE}/products`);
    const data = await res.json();
    
    if (!data.success || !data.products?.length) {
      container.innerHTML = '<div class="empty">暂无产品</div>';
      return;
    }
    
    container.innerHTML = data.products.map((p, i) => `
      <div class="product-card" data-id="${p.id}">
        <div class="product-index">${i + 1}</div>
        <div class="product-media">
          <img src="images/product-${p.slug}.jpg" alt="${p.name}" onerror="this.src='images/hero-bg.jpg'">
        </div>
        <div class="product-info">
          <div class="product-icon"><img src="images/product-${p.slug}.jpg" alt="${p.name}" class="product-icon-img"></div>
          <h3 class="product-name">
            <a href="product.html?slug=${p.slug}">${p.name}</a>
          </h3>
          <p class="product-desc">${p.description}</p>
          <div class="product-features">
            ${p.features.map(f => `<span class="feature-tag">${f}</span>`).join('')}
          </div>
          <div class="product-actions">
            <button class="btn btn-like" onclick="likeProduct(${p.id}, this)">
              <span>❤️</span>
              <span class="like-count">${p.like_count || 0}</span>
            </button>
            <button class="btn btn-share" onclick="shareProduct(${p.id}, '${p.slug}')">
              <span>📤</span>
              <span class="share-count">${p.share_count || 0}</span>
            </button>
          </div>
          <div class="product-stats">
            <span class="stat-item" onclick="location.href='product.html?slug=${p.slug}'">
              💬 ${p.message_count || 0} 留言
            </span>
          </div>
        </div>
      </div>
    `).join('');
  } catch (err) {
    console.error('加载产品失败:', err);
    container.innerHTML = '<div class="error">加载失败，请刷新重试</div>';
  }
}

// 点赞产品
async function likeProduct(id, btn) {
  try {
    const res = await fetch(`${API_BASE}/products/${id}/like`, { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      const countEl = btn.querySelector('.like-count');
      countEl.textContent = data.count;
      btn.classList.toggle('liked', data.liked);
      showToast(data.liked ? '点赞成功！' : '已取消点赞');
    }
  } catch (err) {
    showToast('操作失败', 'error');
  }
}

// 分享产品
async function shareProduct(id, slug) {
  const url = `${location.origin}/product.html?slug=${slug}`;
  
  // 复制到剪贴板
  try {
    await navigator.clipboard.writeText(url);
    showToast('链接已复制到剪贴板！');
  } catch {
    showToast('分享链接: ' + url);
  }
  
  // 记录分享
  try {
    await fetch(`${API_BASE}/products/${id}/share`, { 
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ platform: 'copy' })
    });
  } catch {}
}

// 加载留言
async function loadMessages() {
  const listEl = document.getElementById('messageList');
  const countEl = document.getElementById('messageCount');
  if (!listEl) return;
  
  try {
    const res = await fetch(`${API_BASE}/messages`);
    const data = await res.json();
    
    const messages = data.messages || [];
    countEl && (countEl.textContent = `(${messages.length})`);
    
    if (!messages.length) {
      listEl.innerHTML = `
        <div class="message-empty">
          <div class="empty-icon">📭</div>
          <p>还没有留言，来抢沙发吧！</p>
        </div>`;
      return;
    }
    
    listEl.innerHTML = messages.map(m => createMessageHTML(m)).join('');
  } catch (err) {
    console.error('加载留言失败:', err);
  }
}

// 创建留言 HTML
function createMessageHTML(msg) {
  const colors = ['#FF6B35', '#4ECDC4', '#FFE66D', '#95E1D3', '#F38181'];
  const color = colors[msg.name.charCodeAt(0) % colors.length];
  const initial = msg.name.charAt(0).toUpperCase();
  const time = new Date(msg.created_at).toLocaleString('zh-CN', {
    month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit'
  });
  
  return `
    <div class="message-item">
      <div class="message-item-header">
        <div class="message-avatar" style="background: ${color}">${initial}</div>
        <span class="message-item-name">${escapeHTML(msg.name)}</span>
        <span class="message-item-time">${time}</span>
      </div>
      <div class="message-item-content">${escapeHTML(msg.content)}</div>
    </div>`;
}

// 提交留言
function initMessageForm() {
  const form = document.getElementById('messageForm');
  if (!form) return;
  
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const name = document.getElementById('name').value.trim();
    const email = document.getElementById('email').value.trim();
    const content = document.getElementById('content').value.trim();
    
    if (!name || !content) {
      showToast('请填写昵称和留言内容', 'error');
      return;
    }
    
    try {
      const res = await fetch(`${API_BASE}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, content })
      });
      
      const data = await res.json();
      if (data.success) {
        showToast('留言提交成功！');
        form.reset();
        loadMessages();
      } else {
        showToast(data.error || '提交失败', 'error');
      }
    } catch (err) {
      showToast('网络错误', 'error');
    }
  });
}

// 工具函数
function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// 初始化
document.addEventListener('DOMContentLoaded', () => {
  initNavbar();
  initMobileMenu();
  loadProducts();
  loadMessages();
  initMessageForm();
});
