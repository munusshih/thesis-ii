import { Flip } from "gsap/Flip";
import gsap from "gsap";

gsap.registerPlugin(Flip);

// Initialize Flip tracking for all cards
export function initializeFlip() {
    // Get all card elements
    const cards = document.querySelectorAll(".card, .resource-card, .student-item");

    // Store initial state
    let flipState = Flip.getState(cards);

    // Create a MutationObserver to watch for DOM changes
    const observer = new MutationObserver(() => {
        // Get all cards again (in case new ones were added)
        const updatedCards = document.querySelectorAll(".card, .resource-card, .student-item");

        // Animate from the previous state
        Flip.from(flipState, {
            targets: updatedCards,
            duration: 0.6,
            ease: "power2.inOut",
            stagger: 0.02,
            scale: true,
            absolute: true,
            onComplete: () => {
                // Update the state after animation completes
                flipState = Flip.getState(updatedCards);
            }
        });
    });

    // Observe changes to the document body
    observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['style', 'class']
    });

    return observer;
}

// Function to manually trigger a flip animation
export function flipCards() {
    const cards = document.querySelectorAll(".card, .resource-card, .student-item");
    const state = Flip.getState(cards);

    return {
        state,
        animate: () => {
            Flip.from(state, {
                duration: 0.6,
                ease: "power2.inOut",
                stagger: 0.02,
                scale: true,
                absolute: true
            });
        }
    };
}
