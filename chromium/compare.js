let isDragging = false;
let currentPosition = 50; // percentage

document.addEventListener('DOMContentLoaded', function() {
    loadImages();
    setupSlider();
});

function loadImages() {
    const urlParams = new URLSearchParams(window.location.search);
    const originalData = urlParams.get('original');
    const renderedData = urlParams.get('rendered');
    
    if (originalData && renderedData) {
        const originalImg = document.getElementById('originalImage');
        const renderedImg = document.getElementById('renderedImage');
        
        originalImg.onload = function() {
            // Set container dimensions based on image
            const container = document.getElementById('imageContainer');
            const aspectRatio = this.naturalHeight / this.naturalWidth;
            const maxWidth = Math.min(window.innerWidth * 0.9, 1200);
            const maxHeight = window.innerHeight * 0.7;
            
            let width = maxWidth;
            let height = width * aspectRatio;
            
            if (height > maxHeight) {
                height = maxHeight;
                width = height / aspectRatio;
            }
            
            container.style.width = width + 'px';
            container.style.height = height + 'px';
            container.style.display = 'block';
            document.getElementById('loading').style.display = 'none';
        };
        
        originalImg.src = decodeURIComponent(originalData);
        renderedImg.src = decodeURIComponent(renderedData);
    } else {
        // Simulate loading for demo
        setTimeout(() => {
            document.getElementById('loading').innerHTML = '<div class="spinner"></div><div>Generating photorealistic render...</div>';
        }, 1000);
        
        setTimeout(() => {
            // For demo purposes, show comparison with placeholder
            showDemoComparison();
        }, 3000);
    }
}

function showDemoComparison() {
    const container = document.getElementById('imageContainer');
    container.style.width = '800px';
    container.style.height = '600px';
    container.style.display = 'block';
    document.getElementById('loading').style.display = 'none';
    
    // Set demo images (you can replace with actual demo images)
    document.getElementById('originalImage').src = 'data:image/svg+xml;base64,' + btoa(`
        <svg width="800" height="600" xmlns="http://www.w3.org/2000/svg">
            <rect width="800" height="600" fill="#f0f0f0"/>
            <text x="400" y="300" text-anchor="middle" font-family="Arial" font-size="24" fill="#666">
                Original CAD Screenshot
            </text>
        </svg>
    `);
    
    document.getElementById('renderedImage').src = 'data:image/svg+xml;base64,' + btoa(`
        <svg width="800" height="600" xmlns="http://www.w3.org/2000/svg">
            <defs>
                <linearGradient id="grad1" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" style="stop-color:#667eea;stop-opacity:1" />
                    <stop offset="100%" style="stop-color:#764ba2;stop-opacity:1" />
                </linearGradient>
            </defs>
            <rect width="800" height="600" fill="url(#grad1)"/>
            <text x="400" y="300" text-anchor="middle" font-family="Arial" font-size="24" fill="white">
                Rendered Result
            </text>
        </svg>
    `);
}

function setupSlider() {
    const slider = document.getElementById('slider');
    const container = document.getElementById('imageContainer');
    
    slider.addEventListener('mousedown', startDrag);
    document.addEventListener('mousemove', drag);
    document.addEventListener('mouseup', stopDrag);
    
    // Touch events for mobile
    slider.addEventListener('touchstart', startDrag);
    document.addEventListener('touchmove', drag);
    document.addEventListener('touchend', stopDrag);
}

function startDrag(e) {
    isDragging = true;
    e.preventDefault();
}

function drag(e) {
    if (!isDragging) return;
    
    const container = document.getElementById('imageContainer');
    const rect = container.getBoundingClientRect();
    
    let clientX;
    if (e.type.includes('touch')) {
        clientX = e.touches[0].clientX;
    } else {
        clientX = e.clientX;
    }
    
    const x = clientX - rect.left;
    const percentage = Math.max(0, Math.min(100, (x / rect.width) * 100));
    
    updateSliderPosition(percentage);
    e.preventDefault();
}

function stopDrag() {
    isDragging = false;
}

function updateSliderPosition(percentage) {
    currentPosition = percentage;
    
    const slider = document.getElementById('slider');
    const renderedImage = document.getElementById('renderedImage');
    
    slider.style.left = percentage + '%';
    renderedImage.style.clipPath = `polygon(${percentage}% 0%, 100% 0%, 100% 100%, ${percentage}% 100%)`;
}

function downloadOriginal() {
    const img = document.getElementById('originalImage');
    downloadImage(img.src, 'original-cad.png');
}

function downloadRendered() {
    const img = document.getElementById('renderedImage');
    downloadImage(img.src, 'rendered-cad.png');
}

function downloadImage(dataUrl, filename) {
    const link = document.createElement('a');
    link.download = filename;
    link.href = dataUrl;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function newCapture() {
    window.close();
}

// Keyboard shortcuts
document.addEventListener('keydown', function(e) {
    if (e.key === 'ArrowLeft') {
        updateSliderPosition(Math.max(0, currentPosition - 5));
    } else if (e.key === 'ArrowRight') {
        updateSliderPosition(Math.min(100, currentPosition + 5));
    } else if (e.key === 'Escape') {
        newCapture();
    }
});