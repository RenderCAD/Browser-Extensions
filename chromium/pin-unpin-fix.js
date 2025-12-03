// CLEAN PIN/UNPIN SYSTEM - State-based approach
// This replaces the messy pin/unpin logic in content.js

function applyModalState(modal, isPinned, isExpanded) {
    // STEP 1: Clean slate - remove ALL interfering styles
    const cleanUp = () => {
        // Remove all style elements
        ['rendercad-pinned-style', 'rendercad-modal-lock', 'rendercad-unpin-override'].forEach(id => {
            const elem = document.getElementById(id);
            if (elem) elem.remove();
        });

        // Remove all inline size styles
        ['width', 'min-width', 'max-width', 'height', 'min-height', 'max-height', 'padding'].forEach(prop => {
            modal.style.removeProperty(prop);
        });

        // Remove attributes
        modal.removeAttribute('data-lock-style');

        // Force reflow
        void modal.offsetHeight;
    };

    // STEP 2: Apply the correct state
    if (isPinned) {
        // PINNED STATE
        cleanUp();

        // Set data attribute
        modal.setAttribute('data-pinned', 'true');

        // Apply size (always 60px width)
        modal.style.setProperty('width', '60px', 'important');
        modal.style.setProperty('min-width', '60px', 'important');
        modal.style.setProperty('max-width', '60px', 'important');
        modal.style.setProperty('padding', '0', 'important');

        if (isExpanded) {
            // Pinned + Expanded: 60px wide, auto height
            modal.style.setProperty('height', 'auto', 'important');
            modal.style.setProperty('min-height', '60px', 'important');
            modal.style.setProperty('max-height', 'none', 'important');
        } else {
            // Pinned + Collapsed: 60x60 square
            modal.style.setProperty('height', '60px', 'important');
            modal.style.setProperty('min-height', '60px', 'important');
            modal.style.setProperty('max-height', '60px', 'important');
        }

    } else {
        // UNPINNED STATE
        cleanUp();

        // Remove data attribute
        modal.removeAttribute('data-pinned');

        // Apply size (always 400px width)
        modal.style.setProperty('width', '400px', 'important');
        modal.style.removeProperty('min-width');
        modal.style.removeProperty('max-width');
        modal.style.removeProperty('padding');

        // Height is always auto for unpinned (expands based on content)
        modal.style.setProperty('height', 'auto', 'important');
        modal.style.removeProperty('min-height');
        modal.style.removeProperty('max-height');
    }

    // Force reflow
    void modal.offsetHeight;

    // STEP 3: Update preview container visibility
    const previewContainer = modal.querySelector('.rendercad-preview-container');
    if (previewContainer) {
        if (isExpanded) {
            previewContainer.style.display = 'flex';
            previewContainer.style.maxHeight = '60vh';
            previewContainer.style.opacity = '1';
        } else {
            previewContainer.style.maxHeight = '0';
            previewContainer.style.opacity = '0';
            setTimeout(() => {
                if (!isExpanded) { // Check again in case it changed
                    previewContainer.style.display = 'none';
                }
            }, 300);
        }
    }
}

// Usage:
// applyModalState(loadingModal, true, false);   // Pinned, collapsed (60x60)
// applyModalState(loadingModal, true, true);    // Pinned, expanded (60x auto)
// applyModalState(loadingModal, false, false);  // Unpinned, collapsed (400x auto with hidden preview)
// applyModalState(loadingModal, false, true);   // Unpinned, expanded (400x auto with visible preview)
