// --- ICONS (SVG Strings) ---
// Wir nutzen hier Strings, wandeln sie aber unten sicher mit DOMParser um
const ICON_THUMB_XML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="yt-stat-icon"><path d="M1,21h4V9H1V21z M23,10c0-1.1-0.9-2-2-2h-6.31l0.95-4.57c0.03-0.32-0.25-0.75-0.62-1.12c-0.32-0.32-0.75-0.5-1.19-0.5L12,2 l-7.29,7.29C4.25,9.75,4,10.35,4,11v9c0,1.1,0.9,2,2,2h11c0.83,0,1.54-0.5,1.84-1.22l3.02-7.05C21.96,13.54,22,13.28,22,13 L23,10z"></path></svg>`;
const ICON_REPLY_XML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="yt-stat-icon"><path d="M20,2H4C2.9,2,2,2.9,2,4v18l4-4h14c1.1,0,2-0.9,2-2V4C22,2.9,21.1,2,20,2z"></path></svg>`;

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

// --- DOM BUILDER HELPERS (100% Sicher: DOMParser statt innerHTML) ---

// WICHTIG: Diese Funktion nutzt jetzt DOMParser. Das ist sicher und erlaubt.
function createIcon(xmlString) {
  const parser = new DOMParser();
  // Wandelt den String in ein echtes XML/SVG Dokument um
  const doc = parser.parseFromString(xmlString, "image/svg+xml");
  // Gibt das Wurzelelement (das <svg> Tag) zurück
  return doc.documentElement; 
}

function buildSingleTooltip(comment, videoElement) {
  const container = document.createElement('div');
  container.className = 'yt-tooltip-content-single';
  
  // Header
  const header = document.createElement('div');
  header.className = 'yt-tooltip-header';
  
  // Avatar
  const avatar = document.createElement('img');
  avatar.className = 'yt-tooltip-avatar';
  avatar.src = comment.avatarUrl;
  avatar.onerror = () => { avatar.style.display = 'none'; };
  header.appendChild(avatar);
  
  // Meta Info
  const meta = document.createElement('div');
  meta.className = 'yt-tooltip-meta';
  
  const author = document.createElement('span');
  author.className = 'yt-tooltip-author';
  author.textContent = comment.author; 
  meta.appendChild(author);
  
  const stats = document.createElement('div');
  stats.className = 'yt-tooltip-stats';
  
  // Likes
  const statLike = document.createElement('span');
  statLike.className = 'yt-stat-item';
  statLike.title = 'Likes';
  statLike.appendChild(createIcon(ICON_THUMB_XML));
  statLike.appendChild(document.createTextNode(' ' + comment.likeCount));
  stats.appendChild(statLike);

  // Replies
  const statReply = document.createElement('span');
  statReply.className = 'yt-stat-item';
  statReply.title = 'Replies';
  statReply.appendChild(createIcon(ICON_REPLY_XML));
  statReply.appendChild(document.createTextNode(' ' + comment.replyCount));
  stats.appendChild(statReply);
  
  meta.appendChild(stats);
  header.appendChild(meta);
  
  // Hint
  const hint = document.createElement('span');
  hint.className = 'yt-tooltip-hint';
  hint.textContent = 'Zum Kommentar ➜';
  header.appendChild(hint);
  
  container.appendChild(header);
  
  // Text
  const textDiv = document.createElement('div');
  textDiv.className = 'yt-tooltip-text';
  textDiv.textContent = comment.text; // Sicher: textContent
  container.appendChild(textDiv);

  // Click Event
  container.onclick = (e) => {
      e.stopPropagation();
      scrollToComment(comment.element);
      if (videoElement) {
          videoElement.currentTime = comment.seconds;
          videoElement.play();
      }
  };

  return container;
}

function buildClusterTooltip(cluster, videoElement) {
  const container = document.createElement('div');
  
  // Header
  const header = document.createElement('div');
  header.className = 'yt-tooltip-cluster-header';
  header.textContent = `${cluster.length} Kommentare an dieser Stelle`;
  container.appendChild(header);
  
  // Liste
  const ul = document.createElement('ul');
  ul.className = 'yt-cluster-list';
  
  cluster.forEach((comment) => {
      const li = document.createElement('li');
      li.className = 'yt-cluster-item';
      
      // Avatar
      const img = document.createElement('img');
      img.className = 'yt-cluster-avatar';
      img.src = comment.avatarUrl;
      li.appendChild(img);
      
      // Content
      const content = document.createElement('div');
      content.className = 'yt-cluster-content';
      
      const authorRow = document.createElement('div');
      authorRow.className = 'yt-cluster-author';
      
      const authorName = document.createElement('span');
      authorName.textContent = comment.author;
      authorRow.appendChild(authorName);
      
      const statsMini = document.createElement('div');
      statsMini.className = 'yt-cluster-stats-mini';
      
      const likesSpan = document.createElement('span');
      likesSpan.textContent = `${comment.likeCount} 👍`;
      statsMini.appendChild(likesSpan);

      const timeSpan = document.createElement('span');
      timeSpan.style.marginLeft = '5px';
      timeSpan.textContent = comment.timestampStr;
      statsMini.appendChild(timeSpan);
      
      authorRow.appendChild(statsMini);
      content.appendChild(authorRow);
      
      // Text
      const textDiv = document.createElement('div');
      textDiv.className = 'yt-cluster-text';
      textDiv.textContent = comment.text;
      content.appendChild(textDiv);
      
      li.appendChild(content);
      
      // Click Event pro Item
      li.onclick = (e) => {
          e.stopPropagation();
          scrollToComment(comment.element);
          if (videoElement) {
              videoElement.currentTime = comment.seconds;
              videoElement.play();
          }
      };
      
      ul.appendChild(li);
  });
  
  container.appendChild(ul);
  return container;
}

// --- TOOLTIP LOGIC ---

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

function showTooltip(marker, cluster) {
  if (!tooltipEl) return;
  if (hideTimeout) clearTimeout(hideTimeout);
  
  // Inhalt sicher löschen
  while (tooltipEl.firstChild) {
      tooltipEl.removeChild(tooltipEl.firstChild);
  }
  tooltipEl.onclick = null;

  const isCluster = cluster.length > 1;
  const videoElement = document.querySelector('video');
  
  // Elemente zusammenbauen
  let contentNode;
  if (isCluster) {
      contentNode = buildClusterTooltip(cluster, videoElement);
  } else {
      contentNode = buildSingleTooltip(cluster[0], videoElement);
  }
  
  tooltipEl.appendChild(contentNode);

  // Positionierung
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

// --- MAIN ---

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