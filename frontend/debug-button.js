// Debug-Skript zum Prüfen des externen KI-Training Buttons
console.log('=== Debug External KI Training Button ===');

const btn = document.getElementById('btnRetrainExternalModel');
console.log('Button gefunden:', !!btn);
if (btn) {
  console.log('Button HTML:', btn.outerHTML);
  console.log('Button sichtbar:', btn.offsetParent !== null);
  console.log('Button disabled:', btn.disabled);
  console.log('Button classList:', btn.classList.toString());
  
  const computedStyle = window.getComputedStyle(btn);
  console.log('Display:', computedStyle.display);
  console.log('Visibility:', computedStyle.visibility);
  console.log('Opacity:', computedStyle.opacity);
}

console.log('Body classList:', document.body.classList.toString());
console.log('Enthält ki-mode-external:', document.body.classList.contains('ki-mode-external'));

// Prüfe externalKiTrainingStatus container
const statusContainer = document.getElementById('externalKiTrainingStatus');
console.log('Status Container gefunden:', !!statusContainer);
if (statusContainer) {
  console.log('Status Container sichtbar:', statusContainer.offsetParent !== null);
  const computedStyle = window.getComputedStyle(statusContainer);
  console.log('Status Container Display:', computedStyle.display);
}

// Prüfe CSS-Regel für external-only
const styles = document.styleSheets;
for (let i = 0; i < styles.length; i++) {
  try {
    const rules = styles[i].cssRules || styles[i].rules;
    for (let j = 0; j < rules.length; j++) {
      if (rules[j].selectorText && rules[j].selectorText.includes('external-only')) {
        console.log('CSS-Regel gefunden:', rules[j].cssText);
      }
    }
  } catch (e) {
    // CORS-Fehler bei externen Stylesheets
  }
}
