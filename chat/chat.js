async function fetchMotivation() {
    const output = document.getElementById('motivation');
    output.innerText = "Even geduld, we halen een motiverend bericht op...";
    
    try {
        const response = await fetch('chat.php');
        const data = await response.json();

        if(data.error) {
            output.innerText = `Er ging iets mis:\n${data.message}`;
        } else if(data.choices && data.choices[0] && data.choices[0].message) {
            output.innerText = data.choices[0].message.content;
        } else {
            output.innerText = "Geen motiverend bericht ontvangen.";
        }
    } catch (err) {
        console.error(err);
        output.innerText = "Er ging iets mis bij het ophalen van de motivatie:\n" + err.message;
    }
}

// Laad automatisch bij openen
window.addEventListener('DOMContentLoaded', () => {
    fetchMotivation();

    const refreshBtn = document.getElementById('refresh-btn');
    if(refreshBtn) {
        refreshBtn.addEventListener('click', fetchMotivation);
    }
});
