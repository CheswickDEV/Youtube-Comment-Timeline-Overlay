// --- ICONS ---
const ICON_THUMB = `<svg viewBox="0 0 24 24" class="yt-stat-icon"><path d="M1,21h4V9H1V21z M23,10c0-1.1-0.9-2-2-2h-6.31l0.95-4.57c0.03-0.32-0.25-0.75-0.62-1.12c-0.32-0.32-0.75-0.5-1.19-0.5L12,2 l-7.29,7.29C4.25,9.75,4,10.35,4,11v9c0,1.1,0.9,2,2,2h11c0.83,0,1.54-0.5,1.84-1.22l3.02-7.05C21.96,13.54,22,13.28,22,13 L23,10z"></path></svg>`;
const ICON_REPLY = `<svg viewBox="0 0 24 24" class="yt-stat-icon"><path d="M20,2H4C2.9,2,2,2.9,2,4v18l4-4h14c1.1,0,2-0.9,2-2V4C22,2.9,21.1,2,20,2z"></path></svg>`;


// --- HILFSFUNKTIONEN ---

function parseTimestampToSeconds(timeStr) {
  const parts = timeStr.split(':').map(Number);
  let seconds = 0;
  if (parts.length === 3) {
    seconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
  } else if (parts.length === 2) {
    seconds = parts[0] * 60 + parts[1];
  }
  return seconds;
}

function autoLoadMoreComments() {
  const currentCount = document.querySelectorAll('ytd-comment-thread-renderer').length;
  if (currentCount > 600) return;

  const continuation = document.querySelector('ytd-continuation-item-renderer');
  
  if (continuation) {
      window.dispatchEvent(new Event('scroll'));
      continuation.scrollIntoView({ block: 'end', behavior: 'instant' });
      window.dispatchEvent(new Event('resize'));
  }
}

function extractComments() {
  const comments = [];
  const commentElements = document.querySelectorAll('ytd-comment-thread-renderer');

  commentElements.forEach(el => {
    const authorEl = el.querySelector('#author-text span');
    const contentEl = el.querySelector('#content-text');
    const avatarEl = el.querySelector('#author-thumbnail img');
    
    // Likes
    const voteEl = el.querySelector('#vote-count-middle');
    let likeCount = "0";
    if (voteEl) {
        likeCount = voteEl.innerText.trim();
        if (!likeCount) likeCount = "0";
    }

    // Replies
    let replyCount = "0";
    const repliesRenderer = el.querySelector('ytd-comment-replies-renderer');
    if (repliesRenderer) {
        const moreRepliesBtn = repliesRenderer.querySelector('#more-replies');
        if (moreRepliesBtn) {
            const match = moreRepliesBtn.innerText.match(/(\d+)/);
            if (match) replyCount = match[0];
        } else {
             const buttons = repliesRenderer.querySelectorAll('ytd-button-renderer');
             for (const btn of buttons) {
                 const match = btn.innerText.match(/(\d+)/);
                 if (match) {
                     replyCount = match[0];
                     break; 
                 }
             }
        }
    }
    
    if (!authorEl || !contentEl) return;

    const author = authorEl.innerText.trim();
    const text = contentEl.innerText;
    const avatarUrl = avatarEl ? avatarEl.src : '';
    const timeMatch = text.match(/(\d{1,2}:\d{2}(?::\d{2})?)/);

    if (timeMatch) {
      comments.push({
        author,
        avatarUrl,
        text,
        likeCount,
        replyCount,
        timestampStr: timeMatch[0],
        seconds: parseTimestampToSeconds(timeMatch[0]),
        element: el
      });
    }
  });
  
  return comments.sort((a, b) => a.seconds - b.seconds);
}

function clusterComments(comments, duration, thresholdPercent = 0.5) {
  if (comments.length === 0) return [];
  
  const clusters = [];
  let currentCluster = [comments[0]];
  
  for (let i = 1; i < comments.length; i++) {
    const prev = currentCluster[currentCluster.length - 1];
    const curr = comments[i];
    
    const diffPercent = ((curr.seconds - prev.seconds) / duration) * 100;
    
    if (diffPercent <= thresholdPercent) {
      currentCluster.push(curr);
    } else {
      clusters.push(currentCluster);
      currentCluster = [curr];
    }
  }
  clusters.push(currentCluster);
  
  return clusters;
}

function scrollToComment(element) {
  if (element) {
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const originalBg = element.style.backgroundColor;
    element.style.transition = "background-color 0.5s";
    element.style.backgroundColor = "rgba(255, 204, 0, 0.15)";
    setTimeout(() => { element.style.backgroundColor = originalBg || ""; }, 2000);
  }
}

// --- TOOLTIP RENDERING ---

let tooltipEl = null;
let hideTimeout = null;

function createGlobalTooltip() {
  if (document.getElementById('yt-timeline-tooltip-container')) {
    tooltipEl = document.getElementById('yt-timeline-tooltip-container');
    return;
  }
  tooltipEl = document.createElement('div');
  tooltipEl.id = 'yt-timeline-tooltip-container';
  
  tooltipEl.addEventListener('mouseenter', () => { if (hideTimeout) clearTimeout(hideTimeout); });
  tooltipEl.addEventListener('mouseleave', () => { hideTooltip(); });
  
  document.body.appendChild(tooltipEl);
}

function renderSingleTooltip(comment) {
  return `
    <div class="yt-tooltip-content-single">
      <div class="yt-tooltip-header">
        <img src="${comment.avatarUrl}" class="yt-tooltip-avatar" onerror="this.style.display='none'">
        <div class="yt-tooltip-meta">
            <span class="yt-tooltip-author">${comment.author}</span>
            <div class="yt-tooltip-stats">
                <span class="yt-stat-item" title="Likes">${ICON_THUMB} ${comment.likeCount}</span>
                <span class="yt-stat-item" title="Replies">${ICON_REPLY} ${comment.replyCount}</span>
            </div>
        </div>
        <span class="yt-tooltip-hint">Zum Kommentar ➜</span>
      </div>
      <div class="yt-tooltip-text">${comment.text}</div>
    </div>
  `;
}

function renderClusterTooltip(cluster) {
  let html = `<div class="yt-tooltip-cluster-header">${cluster.length} Kommentare an dieser Stelle</div>`;
  html += `<ul class="yt-cluster-list">`;
  
  cluster.forEach((comment, index) => {
    html += `
      <li class="yt-cluster-item" data-index="${index}">
        <img src="${comment.avatarUrl}" class="yt-cluster-avatar">
        <div class="yt-cluster-content">
          <div class="yt-cluster-author">
             <span>${comment.author}</span>
             <div class="yt-cluster-stats-mini">
                <span>${comment.likeCount} 👍</span>
                <span style="margin-left:5px">${comment.timestampStr}</span>
             </div>
          </div>
          <div class="yt-cluster-text">${comment.text}</div>
        </div>
      </li>
    `;
  });
  
  html += `</ul>`;
  return html;
}

function showTooltip(marker, cluster) {
  if (!tooltipEl) return;
  if (hideTimeout) clearTimeout(hideTimeout);
  
  // WICHTIG: Alte Klick-Listener auf dem Container entfernen
  tooltipEl.onclick = null;

  const isCluster = cluster.length > 1;
  const videoElement = document.querySelector('video');
  
  if (isCluster) {
    // --- CLUSTER MODUS ---
    tooltipEl.innerHTML = renderClusterTooltip(cluster);
    
    // Klick-Events NUR auf die Listeneinträge legen
    const items = tooltipEl.querySelectorAll('.yt-cluster-item');
    items.forEach(item => {
      item.onclick = (e) => {
        e.stopPropagation();
        const idx = item.getAttribute('data-index');
        const selectedComment = cluster[idx];
        
        // 1. Scrollen
        scrollToComment(selectedComment.element);
        
        // 2. Video Zeit exakt setzen (Fix für Timestamp-Mismatch)
        if (videoElement) {
             videoElement.currentTime = selectedComment.seconds;
             videoElement.play();
        }
      };
    });
    
  } else {
    // --- SINGLE MODUS ---
    tooltipEl.innerHTML = renderSingleTooltip(cluster[0]);
    
    // Klick auf den Inhalt (Klasse .yt-tooltip-content-single)
    const contentDiv = tooltipEl.querySelector('.yt-tooltip-content-single');
    if (contentDiv) {
        contentDiv.onclick = (e) => {
          e.stopPropagation(); 
          scrollToComment(cluster[0].element);
          // Optional: Auch hier Zeit nochmal setzen
          if (videoElement) {
               videoElement.currentTime = cluster[0].seconds;
               videoElement.play();
          }
        };
    }
  }

  // --- POSITIONING & PARENT SWITCHING ---
  const isFullscreen = document.fullscreenElement !== null;
  const player = document.querySelector('#movie_player');
  
  if (isFullscreen) {
      if (tooltipEl.parentElement !== player) player.appendChild(tooltipEl);
  } else {
      if (tooltipEl.parentElement !== document.body) document.body.appendChild(tooltipEl);
  }

  tooltipEl.style.display = 'block';

  const markerRect = marker.getBoundingClientRect();
  const tooltipWidth = 450; 
  let leftPos = markerRect.left + (markerRect.width / 2) - (tooltipWidth / 2);
  
  if (leftPos < 10) leftPos = 10;
  if (leftPos + tooltipWidth > window.innerWidth) leftPos = window.innerWidth - tooltipWidth - 20;

  tooltipEl.style.left = `${leftPos}px`;

  if (isFullscreen) {
      const topPos = markerRect.top - tooltipEl.offsetHeight - 25;
      tooltipEl.style.top = `${topPos}px`;
  } else {
      const topPos = markerRect.bottom + 20;
      tooltipEl.style.top = `${topPos}px`;
  }
}

function hideTooltip() {
  hideTimeout = setTimeout(() => {
      if (tooltipEl) tooltipEl.style.display = 'none';
  }, 300); 
}

// --- HAUPT PROGRAMM ---

function initOverlay() {
  autoLoadMoreComments();

  const videoElement = document.querySelector('video');
  const progressBar = document.querySelector('.ytp-progress-bar');
  
  if (!videoElement || !progressBar) return;

  const oldOverlay = document.getElementById('yt-comment-timeline-overlay');
  if (oldOverlay) oldOverlay.remove();

  createGlobalTooltip();

  const duration = videoElement.duration;
  const comments = extractComments();

  if (comments.length === 0) return;

  const clusters = clusterComments(comments, duration, 0.5);

  const overlay = document.createElement('div');
  overlay.id = 'yt-comment-timeline-overlay';
  
  clusters.forEach(cluster => {
    const firstComment = cluster[0];
    const positionPercent = (firstComment.seconds / duration) * 100;
    
    if (positionPercent < 0 || positionPercent > 100) return;

    const marker = document.createElement('div');
    marker.className = 'yt-timeline-marker';
    if (cluster.length > 1) marker.classList.add('is-cluster');
    
    marker.style.left = `${positionPercent}%`;

    marker.addEventListener('mouseenter', () => { showTooltip(marker, cluster); });
    marker.addEventListener('mouseleave', () => { hideTooltip(); });
    
    // Klick auf Marker auf der Leiste -> Springt immer zum ersten Kommentar des Clusters
    marker.addEventListener('click', (e) => {
      e.stopPropagation();
      videoElement.currentTime = firstComment.seconds;
      videoElement.play();
    });

    overlay.appendChild(marker);
  });

  progressBar.appendChild(overlay);
}

// --- INIT & OBSERVERS ---

setTimeout(initOverlay, 3000);
document.addEventListener('yt-navigate-finish', () => setTimeout(initOverlay, 2000));

window.addEventListener('scroll', () => {
    if (window.ytTimelineDebounce) clearTimeout(window.ytTimelineDebounce);
    window.ytTimelineDebounce = setTimeout(() => {
        initOverlay();
    }, 1000);
});

let lastCommentCount = 0;
setInterval(() => {
    const currentCount = document.querySelectorAll('ytd-comment-thread-renderer').length;
    if (currentCount !== lastCommentCount) {
        lastCommentCount = currentCount;
        initOverlay();
    }
}, 2000);