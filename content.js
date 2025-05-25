(() => {
  if (window.geminiSlowTyperContentScriptLoaded) return;
  window.geminiSlowTyperContentScriptLoaded = true;

  const DEFAULT_TYPING_SPEED = 100;
  const DEFAULT_CONSTANT_DELAY = 1000;
  const DEFAULT_RANDOM_MIN = 500;
  const DEFAULT_RANDOM_MAX = 2000;

  let currentTargetElement = null;
  let currentTargetIsGoogleDocs = false;
  let currentTargetSelector = null;
  let isTyping = false;

  const WRITING_SAMPLE = `In "Self Reliance," Emmerson suggests that true genius comes from trusting your own ideas and beliefs, even when others try to change it. He argues that the crux of greatness is to "believe that what is true for you in your private heart is true for all men" (1), urging people to value their own thoughts as significant. This idea rejects conforming, as society "is in conspiracy against the manhood of every one of its members" (2), demanding that people give up their originality to be collectively accepted. The idea is further emphasized through the contrast between "the virtue in most request is conformity" (2) and the call to embrace "the integrity of your own mind" (2), highlighting the tension between adhering to society's expectations, ultimately pushing people to focus on their own unique thoughts and beliefs rather than the demands to conform. In 2024, the idea of conforming to society is relevant in an age of digital activity, especially social media, where the pressure to conform to some popular opinion can dilute someone's actual thoughts. Emmerson encourages us to believe in ourselves, reminding us that being true to who we are is important for feeling happy and free to think for ourselves.
The author pushes people to see the significance of individuality and self-trust. In the repetition of "Let a man…" (5), an anaphora is used to reinforce the idea that people should recognize their own work and act independently of others. Emmerson utilizes questioning, which challenges our conventional beliefs in "Is the acorn better than the oak which is its fulness and completion?" (6). The question makes readers think about how much they admire the past and encourages them to value what is happening now. Emmson illustrates the significance of living authentically through a metaphor, comparing the journey of life to a zigzag voyage, "The voyage of the best ship is a zigzag line of a hundred tacks" (4). The metaphor suggests that actual progress is not linear, it is more of a set of experiences that sum up someone's individuality. The rhetorical strategies of anaphora, questioning, and metaphor, underscore Emmerson's idea of self-reliance, pushing people to embrace their own paths and go against conformity. In today's world, many feel the pressure to fit into specific roles, like in their careers or personal lives. They might choose traditional career paths since they think it's what society expects. However, like Emmerson recommends, embracing one's unique journey, whether it means pursuing art, or creating a business, can lead to true fulfillment.
Emmerson highlights the principle of self-reliance through an exploration of people's relationship with society, nature, and self. He pushes the idea that true self-reliance needs a disconnect from societal expectations, getting people to embrace their own identities., illustrated by, "I have lived with you after appearances hitherto. Henceforward I am the truth's" (8). The declaration draws attention to the courage required to reject conformity and to hold personal truths over any inherited ideas. Emmerson underscores the need for inner strength by comparing societal influence to a "mob" (7), which takes away from being unique, stressing how important it is to grow spiritually instead of being alone. The incorporation of a metaphor in describing society as a "mob" brings up a vivid image of conformity being inherently chaotic, while the phrase, "the soul is no traveller; the wise man stays at home" (9), employs a paradox to challenge the conventional ideas of growth through external, not internal, exploration. The idea implies that real growth comes from looking inside ourselves instead of searching outside. The notion is significant today since many people feel a pressure to fit in. It shows how crucial it is for everyone to develop their inner selves, and not get caught up in fake success. Doing this helps build real relationships and understand oneself better, even with all the distractions in people's busy lives.`;

  const GOOGLE_DOCS_EDITABLE_SELECTOR = '.kix-appview-editor';
  const GOOGLE_DOCS_IFRAME_SELECTOR = 'iframe.docs-texteventtarget-iframe';

  function getActiveElement(doc = document) {
    let activeElement = doc.activeElement;
    if (activeElement && activeElement.shadowRoot) {
      let shadowActiveElement = activeElement.shadowRoot.activeElement;
      if (shadowActiveElement) {
        activeElement = shadowActiveElement;
      }
    }
    if (activeElement && activeElement.tagName === 'IFRAME' && activeElement.contentDocument) {
      try {
        const iframeActiveElement = getActiveElement(activeElement.contentDocument);
        if (isEditable(iframeActiveElement)) {
          return iframeActiveElement;
        }
      } catch (e) {
        console.warn("Error accessing iframe's active element:", e.message);
      }
    }
    return activeElement;
  }

  function isEditable(element) {
    if (!element) return false;
    return (
      element.isContentEditable ||
      element.tagName === 'INPUT' ||
      element.tagName === 'TEXTAREA' ||
      (element.closest && element.closest(GOOGLE_DOCS_EDITABLE_SELECTOR))
    );
  }

  function findGoogleDocsEditor(docContext = document) {
    const editor = docContext.querySelector('.kix-appview-editor');
    if (editor) {
      const cursor = editor.querySelector('.kix-cursor');
      if (cursor && cursor.parentElement) {
        return cursor.parentElement;
      }
      
      const activeBlock = editor.querySelector('.kix-lineview-active');
      if (activeBlock) return activeBlock;

      const contentArea = editor.querySelector('.kix-paragraphrenderer');
      if (contentArea) return contentArea;
    }

    const fallbackSelectors = [
      '.docs-texteventtarget-iframe',
      '.kix-canvas-tile-content',
      'div[role="textbox"][aria-multiline="true"]',
      '.docs-texteventtarget',
      '.kix-lineview',
    ];

    for (const selector of fallbackSelectors) {
      const element = docContext.querySelector(selector);
      if (element) return element;
    }

    return docContext.querySelector(GOOGLE_DOCS_EDITABLE_SELECTOR) || null;
  }

  function getUniqueSelector(elm) {
    if (!elm || !elm.tagName) return null;
    if (elm.id) return `#${elm.id}`;

    let path = '', current = elm;
    while (current && current.tagName && current.nodeType === Node.ELEMENT_NODE) {
        let selector = current.tagName.toLowerCase();
        if (current.id) {
            selector += `#${current.id}`;
            path = selector + (path ? '>' + path : '');
            break;
        }

        let sib = current, nth = 1;
        while ((sib = sib.previousElementSibling)) {
            if (sib.tagName.toLowerCase() === selector) nth++;
        }
        if (nth !== 1) selector += `:nth-of-type(${nth})`;
        
        path = selector + (path ? '>' + path : '');
        current = current.parentElement;
    }
    return path || null;
  }


  function showPromptModal(initialPromptText = "") {
    return new Promise((resolve) => {
      const existingModal = document.getElementById('gemini-prompt-modal');
      if (existingModal) existingModal.remove();

      const modal = document.createElement('div');
      modal.id = 'gemini-prompt-modal';
      modal.style.cssText = `
        position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
        background-color: white; border: none; border-radius: 12px;
        padding: 0; box-shadow: 0 4px 24px rgba(0,0,0,0.1); z-index: 2147483647;
        width: 400px; max-width: 90%; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      `;

      const dragBar = document.createElement('div');
      dragBar.style.cssText = `
        width: 100%;
        height: 40px;
        background-color: #f1f3f4;
        cursor: move;
        display: flex;
        justify-content: space-between;
        align-items: center;
        border-top-left-radius: 12px;
        border-top-right-radius: 12px;
        user-select: none;
      `;

      const dragTitle = document.createElement('div');
      dragTitle.textContent = 'Gemini Slow Typer';
      dragTitle.style.cssText = 'margin-left: 15px; font-size: 14px; color: #5f6368;';

      const closeButton = document.createElement('div');
      closeButton.innerHTML = '&#x2715;';
      closeButton.style.cssText = `
        margin-right: 15px;
        cursor: pointer;
        color: #5f6368;
        font-size: 16px;
        padding: 5px;
      `;
      closeButton.onclick = () => closeFunction(null);

      dragBar.appendChild(dragTitle);
      dragBar.appendChild(closeButton);

      let isDragging = false;
      let currentX;
      let currentY;
      let initialX;
      let initialY;
      let xOffset = 0;
      let yOffset = 0;

      dragBar.onmousedown = dragStart;
      document.onmousemove = drag;
      document.onmouseup = dragEnd;

      function dragStart(e) {
        initialX = e.clientX - xOffset;
        initialY = e.clientY - yOffset;

        if (e.target === dragBar || e.target === dragTitle) {
          isDragging = true;
        }
      }

      function drag(e) {
        if (isDragging) {
          e.preventDefault();
          currentX = e.clientX - initialX;
          currentY = e.clientY - initialY;
          xOffset = currentX;
          yOffset = currentY;

          modal.style.transform = `translate(calc(-50% + ${currentX}px), calc(-50% + ${currentY}px))`;
        }
      }

      function dragEnd() {
        isDragging = false;
      }

      const contentContainer = document.createElement('div');
      contentContainer.style.cssText = 'padding: 25px;';

      const title = document.createElement('h3');
      title.textContent = 'Generate Text';
      title.style.cssText = 'margin-top: 0; margin-bottom: 20px; color: #1a73e8; font-size: 20px; font-weight: 600;';

      const limitsContainer = document.createElement('div');
      limitsContainer.style.cssText = `
        position: relative;
        width: calc(100% - 24px);
        display: none;
        flex-wrap: wrap;
        gap: 10px;
        background: #f8f9fa;
        padding: 12px;
        border-radius: 8px;
        max-height: 0;
        overflow: hidden;
        opacity: 0;
        transition: all 0.3s ease-out, max-height 0.3s ease-out;
        margin-bottom: 0;
      `;

      const createNumberInput = (initialValue, placeholder = '') => {
        const input = document.createElement('input');
        input.type = 'text';
        input.value = initialValue;
        input.placeholder = placeholder;
        input.min = '0';
        input.style.cssText = `
          width: calc(100% - 24px);
          padding: 4px 8px;
          border: 1px solid #dadce0;
          border-radius: 0;
          font-size: 13px;
          height: 24px;
          outline: none;
        `;
        
        input.addEventListener('input', () => validateIntegerInput(input));
        
        input.addEventListener('keypress', (e) => {
          if (e.key === '-' && input.value.length === 0) return;
          if (!/[\d]/.test(e.key)) {
            e.preventDefault();
          }
        });
        
        return input;
      };

      const validateIntegerInput = (input) => {
        let value = input.value.replace(/[^\d-]/g, '');
        value = value.replace(/^-/, '#').replace(/-/g, '').replace('#', '-');
        
        if (value === '-') value = '';
        else if (value !== '') {
          value = parseInt(value, 10);
          if (isNaN(value)) value = '';
        }
        
        if (input.min && value !== '' && parseInt(value) < parseInt(input.min)) {
          value = input.min;
        }
        
        input.value = value;
      };

      const createLimitInput = (placeholder) => {
        const container = document.createElement('div');
        container.style.cssText = 'flex: 1; display: flex; flex-direction: column; gap: 4px;';
        
        const input = createNumberInput('', placeholder);
        
        const label = document.createElement('label');
        label.textContent = placeholder;
        label.style.cssText = 'font-size: 12px; color: #5f6368;';
        
        container.appendChild(label);
        container.appendChild(input);
        return { container, input };
      };

      const sentenceLimit = createLimitInput('Sentences');
      const wordLimit = createLimitInput('Words');
      const charLimit = createLimitInput('Characters');

      limitsContainer.appendChild(sentenceLimit.container);
      limitsContainer.appendChild(wordLimit.container);
      limitsContainer.appendChild(charLimit.container);

      const modeContainer = document.createElement('div');
      modeContainer.style.cssText = 'margin-bottom: 20px; display: flex; gap: 10px; justify-content: center;';

      const createModeButton = (text, value, selected = false) => {
        const button = document.createElement('button');
        button.textContent = text;
        button.dataset.mode = value;
        button.style.cssText = `
          padding: 8px 16px;
          background-color: ${selected ? '#1a73e8' : '#f8f9fa'};
          color: ${selected ? 'white' : '#1a73e8'};
          border: 1px solid ${selected ? '#1a73e8' : '#dadce0'};
          border-radius: 6px;
          cursor: pointer;
          font-size: 14px;
          font-weight: 500;
          transition: all 0.2s ease;
          flex: 1;
          text-align: center;
        `;
        button.onmouseover = () => {
          if (selected) {
            button.style.backgroundColor = '#1557b0';
            button.style.color = 'white';
            button.style.borderColor = '#1557b0';
          } else {
            button.style.backgroundColor = '#e8eaed';
            button.style.color = '#1a73e8';
            button.style.borderColor = '#dadce0';
          }
        };
        button.onmouseout = () => {
          button.style.backgroundColor = selected ? '#1a73e8' : '#f8f9fa';
          button.style.color = selected ? 'white' : '#1a73e8';
          button.style.borderColor = selected ? '#1a73e8' : '#dadce0';
        };
        return button;
      };

      const modes = [
        { text: 'Normal', value: 'normal' },
        { text: 'Simple', value: 'simple' },
        { text: 'Me', value: 'me' }
      ];

      let selectedMode = 'normal';
      const modeButtons = modes.map(mode => {
        const button = createModeButton(mode.text, mode.value, mode.value === selectedMode);
        button.onclick = () => {
          selectedMode = mode.value;
          
          modeButtons.forEach(btn => {
            const isSelected = btn.dataset.mode === selectedMode;
            
            btn.style.backgroundColor = isSelected ? '#1a73e8' : '#f8f9fa';
            btn.style.color = isSelected ? 'white' : '#1a73e8';
            btn.style.borderColor = isSelected ? '#1a73e8' : '#dadce0';
            
            btn.onmouseover = () => {
              if (isSelected) {
                btn.style.backgroundColor = '#1557b0';
                btn.style.color = 'white';
                btn.style.borderColor = '#1557b0';
              } else {
                btn.style.backgroundColor = '#e8eaed';
                btn.style.color = '#1a73e8';
                btn.style.borderColor = '#dadce0';
              }
            };
            
            btn.onmouseout = () => {
              btn.style.backgroundColor = isSelected ? '#1a73e8' : '#f8f9fa';
              btn.style.color = isSelected ? 'white' : '#1a73e8';
              btn.style.borderColor = isSelected ? '#1a73e8' : '#dadce0';
            };
          });
        };
        return button;
      });

      modeButtons.forEach(button => modeContainer.appendChild(button));

      const label = document.createElement('label');
      label.textContent = 'Enter your prompt for Gemini:';
      label.style.cssText = 'display: block; margin-bottom: 8px; font-size: 14px; color: #202124;';

      const textarea = document.createElement('textarea');
      textarea.value = initialPromptText;
      textarea.rows = 4;
      textarea.style.cssText = `
        width: calc(100% - 20px); padding: 12px; border-radius: 0; 
        border: 1px solid #dadce0; font-size: 14px; margin-bottom: 20px; 
        resize: vertical; outline: none; transition: border-color 0.2s ease;
      `;
      textarea.placeholder = "Write your prompt here";
      textarea.onfocus = () => {
        textarea.style.borderColor = '#1a73e8';
      };
      textarea.onblur = () => {
        textarea.style.borderColor = '#dadce0';
      };
      textarea.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          submitButton.click();
        }
      });

      const limitsButton = document.createElement('button');
      limitsButton.textContent = 'Show Limits';
      limitsButton.style.cssText = `
        padding: 8px 16px;
        background-color: #f8f9fa;
        color: #1a73e8;
        border: 1px solid #dadce0;
        border-radius: 6px;
        cursor: pointer;
        font-size: 14px;
        font-weight: 500;
        transition: all 0.2s ease;
        margin-bottom: 20px;
        flex: 1;
      `;

      const speedButton = document.createElement('button');
      speedButton.textContent = 'Show Speed & Delay';
      speedButton.style.cssText = limitsButton.style.cssText;

      const buttonsWrapper = document.createElement('div');
      buttonsWrapper.style.cssText = 'display: flex; gap: 10px; margin-bottom: 20px;';
      buttonsWrapper.appendChild(limitsButton);
      buttonsWrapper.appendChild(speedButton);

      const speedContainer = document.createElement('div');
      speedContainer.style.cssText = `
        position: relative;
        width: calc(100% - 24px);
        display: none;
        background: #f8f9fa;
        padding: 12px;
        border-radius: 8px;
        max-height: 0;
        overflow: hidden;
        opacity: 0;
        transition: all 0.3s ease-out;
        margin-bottom: 0;
      `;

      const speedInput = document.createElement('div');
      speedInput.style.cssText = 'margin-bottom: 15px; width: 100%;';
      const speedInputLabel = document.createElement('label');
      speedInputLabel.style.cssText = 'display: block; margin-bottom: 5px; font-size: 12px; color: #5f6368;';
      speedInputLabel.textContent = 'Typing Speed (ms):';
      const speedInputField = createNumberInput(DEFAULT_TYPING_SPEED);
      speedInputField.style.cssText = `
        width: calc(100% - 16px);
        padding: 4px 8px;
        border: 1px solid #dadce0;
        border-radius: 0;
        font-size: 13px;
        height: 24px;
        outline: none;
      `;
      speedInput.appendChild(speedInputLabel);
      speedInput.appendChild(speedInputField);

      const delayButtons = document.createElement('div');
      delayButtons.style.cssText = 'display: flex; gap: 8px; justify-content: space-between; width: 100%;';
      delayButtons.innerHTML = `
        <button id="no-delay" class="delay-btn selected">No Delay</button>
        <button id="constant-delay" class="delay-btn">Constant</button>
        <button id="random-delay" class="delay-btn">Random</button>
      `;

      const style = document.createElement('style');
      style.textContent = `
        .delay-btn {
          flex: 1;
          padding: 6px 8px;
          background: #f8f9fa;
          border: 1px solid #dadce0;
          border-radius: 4px;
          cursor: pointer;
          font-size: 13px;
          color: #1a73e8;
          transition: all 0.2s ease;
          white-space: nowrap;
          min-width: 0;
        }
        .delay-btn.selected {
          background: #1a73e8;
          color: white;
          border-color: #1a73e8;
        }
      `;
      document.head.appendChild(style);

      const constantDelaySettings = document.createElement('div');
      constantDelaySettings.style.cssText = 'margin-top: 15px; display: none; width: 100%;';
      const constantDelayLabel = document.createElement('label');
      constantDelayLabel.style.cssText = 'display: block; margin-bottom: 5px; font-size: 12px; color: #5f6368;';
      constantDelayLabel.textContent = 'Constant Delay (ms):';
      const constantDelayInput = createNumberInput(DEFAULT_CONSTANT_DELAY);
      constantDelayInput.style.cssText = `
        width: calc(100% - 16px);
        padding: 4px 8px;
        border: 1px solid #dadce0;
        border-radius: 0;
        font-size: 13px;
        height: 24px;
        outline: none;
      `;
      constantDelaySettings.appendChild(constantDelayLabel);
      constantDelaySettings.appendChild(constantDelayInput);

      const randomDelaySettings = document.createElement('div');
      randomDelaySettings.style.cssText = 'margin-top: 15px; display: none; width: 100%;';

      const minDelayContainer = document.createElement('div');
      minDelayContainer.style.cssText = 'margin-bottom: 10px; width: 100%;';
      const minDelayLabel = document.createElement('label');
      minDelayLabel.style.cssText = 'display: block; margin-bottom: 5px; font-size: 12px; color: #5f6368;';
      minDelayLabel.textContent = 'Min Delay (ms):';
      const minDelayInput = createNumberInput(DEFAULT_RANDOM_MIN);
      minDelayInput.style.cssText = `
        width: calc(100% - 16px);
        padding: 4px 8px;
        border: 1px solid #dadce0;
        border-radius: 0;
        font-size: 13px;
        height: 24px;
        outline: none;
      `;
      minDelayContainer.appendChild(minDelayLabel);
      minDelayContainer.appendChild(minDelayInput);

      const maxDelayContainer = document.createElement('div');
      maxDelayContainer.style.cssText = 'width: 100%;';
      const maxDelayLabel = document.createElement('label');
      maxDelayLabel.style.cssText = 'display: block; margin-bottom: 5px; font-size: 12px; color: #5f6368;';
      maxDelayLabel.textContent = 'Max Delay (ms):';
      const maxDelayInput = createNumberInput(DEFAULT_RANDOM_MAX);
      maxDelayInput.style.cssText = `
        width: calc(100% - 16px);
        padding: 4px 8px;
        border: 1px solid #dadce0;
        border-radius: 0;
        font-size: 13px;
        height: 24px;
        outline: none;
      `;
      maxDelayContainer.appendChild(maxDelayLabel);
      maxDelayContainer.appendChild(maxDelayInput);

      randomDelaySettings.appendChild(minDelayContainer);
      randomDelaySettings.appendChild(maxDelayContainer);

      speedContainer.appendChild(speedInput);
      speedContainer.appendChild(delayButtons);
      speedContainer.appendChild(constantDelaySettings);
      speedContainer.appendChild(randomDelaySettings);

      const handleDelayButtonClick = (buttonId) => {
        const buttons = delayButtons.querySelectorAll('.delay-btn');
        buttons.forEach(btn => btn.classList.remove('selected'));
        delayButtons.querySelector(`#${buttonId}`).classList.add('selected');

        constantDelaySettings.style.display = 'none';
        randomDelaySettings.style.display = 'none';

        requestAnimationFrame(() => {
          if (buttonId === 'constant-delay') {
            constantDelaySettings.style.display = 'block';
            speedContainer.style.height = 'auto';
          } else if (buttonId === 'random-delay') {
            randomDelaySettings.style.display = 'block';
            speedContainer.style.height = 'auto';
          }

          requestAnimationFrame(() => {
            speedContainer.style.maxHeight = speedContainer.scrollHeight + 'px';
            modal.style.height = 'auto';
            contentContainer.style.height = 'auto';
          });
        });
      };

      delayButtons.querySelector('#no-delay').onclick = () => handleDelayButtonClick('no-delay');
      delayButtons.querySelector('#constant-delay').onclick = () => handleDelayButtonClick('constant-delay');
      delayButtons.querySelector('#random-delay').onclick = () => handleDelayButtonClick('random-delay');

      speedButton.onclick = () => {
        const isShowing = speedContainer.style.maxHeight !== '0px';
        
        if (!isShowing) {
          speedContainer.style.display = 'block';
          speedContainer.style.position = 'relative';
          speedContainer.style.height = 'auto';
          speedContainer.offsetHeight;
          
          requestAnimationFrame(() => {
            speedContainer.style.maxHeight = speedContainer.scrollHeight + 'px';
            speedContainer.style.opacity = '1';
            speedContainer.style.marginBottom = '20px';

            contentContainer.style.height = 'auto';
            modal.style.height = 'auto';
          });
        } else {
          speedContainer.style.maxHeight = '0px';
          speedContainer.style.opacity = '0';
          speedContainer.style.marginBottom = '0';
          
          setTimeout(() => {
            if (speedContainer.style.maxHeight === '0px') {
              speedContainer.style.display = 'none';
            }
          }, 300);
        }
        
        speedButton.textContent = isShowing ? 'Show Speed & Delay' : 'Hide Speed & Delay';
      };

      limitsContainer.style.display = 'none';
      
      limitsButton.onclick = () => {
        const isShowing = limitsContainer.style.maxHeight !== '0px';
        
        if (!isShowing) {
          limitsContainer.style.display = 'block';
          limitsContainer.style.position = 'relative';
          limitsContainer.style.height = 'auto';
          limitsContainer.offsetHeight;
          
          requestAnimationFrame(() => {
            limitsContainer.style.maxHeight = limitsContainer.scrollHeight + 'px';
            limitsContainer.style.opacity = '1';
            limitsContainer.style.marginBottom = '20px';

            contentContainer.style.height = 'auto';
            modal.style.height = 'auto';
          });
        } else {
          limitsContainer.style.maxHeight = '0px';
          limitsContainer.style.opacity = '0';
          limitsContainer.style.marginBottom = '0';
          
          setTimeout(() => {
            if (limitsContainer.style.maxHeight === '0px') {
              limitsContainer.style.display = 'none';
            }
          }, 300);
        }
        
        limitsButton.textContent = isShowing ? 'Show Limits' : 'Hide Limits';
      };

      const buttonContainer = document.createElement('div');
      buttonContainer.style.cssText = 'text-align: right; display: flex; gap: 10px; justify-content: flex-end; margin-top: 20px;';

      const submitButton = document.createElement('button');
      submitButton.textContent = 'Generate & Type';
      submitButton.style.cssText = `
        padding: 10px 20px; background-color: #1a73e8; color: white;
        border: none; border-radius: 6px; cursor: pointer; font-size: 14px;
        font-weight: 500; transition: background-color 0.2s ease;
      `;
      submitButton.onmouseover = () => {
        submitButton.style.backgroundColor = '#1557b0';
      };
      submitButton.onmouseout = () => {
        submitButton.style.backgroundColor = '#1a73e8';
      };

      const cancelButton = document.createElement('button');
      cancelButton.textContent = 'Cancel';
      cancelButton.style.cssText = `
        padding: 10px 20px; background-color: #fff; color: #5f6368;
        border: 1px solid #dadce0; border-radius: 6px; cursor: pointer;
        font-size: 14px; font-weight: 500; transition: background-color 0.2s ease;
      `;
      cancelButton.onmouseover = () => {
        cancelButton.style.backgroundColor = '#f1f3f4';
      };
      cancelButton.onmouseout = () => {
        cancelButton.style.backgroundColor = '#fff';
      };

      const closeFunction = (text) => {
        if (text !== null) {
          const mode = selectedMode;
          let finalPrompt = text;
          
          if (mode === 'simple') {
            finalPrompt = `${text}\n\nPlease write this in 8th grade english, simple.`;
          } else if (mode === 'me') {
            finalPrompt = `${text}\n\nMake the style and quality of english similar to this writing sample: "${WRITING_SAMPLE}"`;
          }

          const limits = {
            sentences: parseInt(sentenceLimit.input.value) || 0,
            words: parseInt(wordLimit.input.value) || 0,
            characters: parseInt(charLimit.input.value) || 0
          };

          const speedSettings = {
            typingSpeed: parseInt(speedInputField.value) || DEFAULT_TYPING_SPEED,
            delayType: delayButtons.querySelector('.selected').id,
            constantDelay: parseInt(constantDelayInput?.value) || DEFAULT_CONSTANT_DELAY,
            randomMinDelay: parseInt(minDelayInput?.value) || DEFAULT_RANDOM_MIN,
            randomMaxDelay: parseInt(maxDelayInput?.value) || DEFAULT_RANDOM_MAX
          };
          
          modal.remove();
          resolve({ prompt: finalPrompt, limits, speedSettings });
        } else {
          modal.remove();
          resolve(null);
        }
      };

      submitButton.onclick = () => closeFunction(textarea.value.trim());
      cancelButton.onclick = () => closeFunction(null);
      
      modal.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          cancelButton.click();
        } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
          submitButton.click();
        }
      });

      modal.appendChild(dragBar);
      contentContainer.appendChild(title);
      contentContainer.appendChild(modeContainer);
      contentContainer.appendChild(label);
      contentContainer.appendChild(textarea);
      contentContainer.appendChild(buttonsWrapper);
      contentContainer.appendChild(limitsContainer);
      contentContainer.appendChild(speedContainer);
      buttonContainer.appendChild(cancelButton);
      buttonContainer.appendChild(submitButton);
      contentContainer.appendChild(buttonContainer);
      modal.appendChild(contentContainer);
      document.body.appendChild(modal);
      textarea.focus();
      textarea.select();
    });
  }

  function typeCharacterIntoElement(char, targetEl, isGDocs) {
    if (!targetEl || !document.contains(targetEl)) {
        return false;
    }

    try {
        targetEl.focus();
    } catch (e) {
        console.warn("Could not focus target element:", e.message);
    }


    if (isGDocs) {
        const doc = targetEl.ownerDocument || document;
        const win = doc.defaultView || window;

        try {
            const selection = win.getSelection();
            if (!selection) {
                console.warn("No selection object found for Google Docs target.");
                return false;
            }
            
            let range;
            if (selection.rangeCount > 0) {
                range = selection.getRangeAt(0);
            } else {
                range = doc.createRange();
                range.selectNodeContents(targetEl);
                range.collapse(false); 
            }
            
            if (!targetEl.contains(range.commonAncestorContainer) && targetEl !== range.commonAncestorContainer) {
                console.warn("Selection range is outside the target element. Attempting to reset range.");
                range.selectNodeContents(targetEl);
                range.collapse(false);
            }

            range.deleteContents();
            const textNode = doc.createTextNode(char);
            range.insertNode(textNode);

            range.setStartAfter(textNode);
            range.setEndAfter(textNode);
            selection.removeAllRanges();
            selection.addRange(range);

            const commonEventProps = { bubbles: true, cancelable: true, composed: true };
            targetEl.dispatchEvent(new KeyboardEvent('keydown', { ...commonEventProps, key: char, charCode: char.charCodeAt(0) }));
            targetEl.dispatchEvent(new KeyboardEvent('keypress', { ...commonEventProps, key: char, charCode: char.charCodeAt(0) }));
            targetEl.dispatchEvent(new InputEvent('input', { ...commonEventProps, data: char, inputType: 'insertText' }));
            targetEl.dispatchEvent(new KeyboardEvent('keyup', { ...commonEventProps, key: char, charCode: char.charCodeAt(0) }));

        } catch (e) {
            console.error("Error typing into Google Docs element with Selection API:", e);
            try {
                doc.execCommand('insertText', false, char);
            } catch (ex) {
                console.error("Fallback execCommand('insertText') also failed:", ex);
                return false;
            }
        }

    } else if (typeof targetEl.value !== 'undefined') {
        const start = targetEl.selectionStart;
        const end = targetEl.selectionEnd;
        const oldValue = targetEl.value;
        targetEl.value = oldValue.substring(0, start) + char + oldValue.substring(end);
        targetEl.selectionStart = targetEl.selectionEnd = start + char.length;
        targetEl.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
    } else if (targetEl.isContentEditable) {
        const doc = targetEl.ownerDocument || document;
        doc.execCommand('insertText', false, char);
    } else {
        console.warn("Target element is not a standard input, textarea, or contentEditable.");
        return false;
    }
    return true;
  }

  function stopTyping() {
    if (isTyping) {
      chrome.runtime.sendMessage({ action: "STOP_TYPING" });
      isTyping = false;
      createNotification("Typing stopped by user", false);
    }
  }

  document.addEventListener("keydown", (e) => {
    if (e.ctrlKey && (e.key === "z" || e.key === "x")) {
      stopTyping();
    }
  });

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "PROMPT_FOR_TEXT") {
      let docContext = document;
      let potentialGDocsIframe = document.querySelector(GOOGLE_DOCS_IFRAME_SELECTOR);
      currentTargetIsGoogleDocs = !!(document.querySelector(GOOGLE_DOCS_EDITABLE_SELECTOR) || potentialGDocsIframe);

      if (potentialGDocsIframe && potentialGDocsIframe.contentDocument) {
          docContext = potentialGDocsIframe.contentDocument;
          currentTargetElement = findGoogleDocsEditor(docContext) || getActiveElement(docContext);
          if (!isEditable(currentTargetElement) && docContext.body) {
              currentTargetElement = docContext.body;
          }
      } else if (currentTargetIsGoogleDocs) {
          currentTargetElement = findGoogleDocsEditor(document) || getActiveElement(document);
      } else {
          currentTargetElement = getActiveElement(document);
      }
      
      if (!isEditable(currentTargetElement)) {
          if (document.body) {
              currentTargetElement = document.body;
          } else {
              sendResponse({ error: "No targetable element found on the page." });
              return true;
          }
      }
      
      currentTargetSelector = getUniqueSelector(currentTargetElement);

      showPromptModal(request.initialPromptText || "").then(result => {
        if (result !== null) {
          chrome.runtime.sendMessage({
            action: "PROMPT_RESPONSE",
            promptText: result.prompt,
            isGoogleDocs: currentTargetIsGoogleDocs,
            targetSelector: currentTargetSelector,
            limits: result.limits
          }).catch(e => console.error("Error sending prompt response to background:", e));
          sendResponse({ status: "prompt_sent" });
        } else {
          sendResponse({ status: "cancelled" });
        }
      });
      return true;
    } else if (request.action === "TYPE_CHARACTER") {
      isTyping = true;
      let targetEl = currentTargetElement;
      if (request.targetSelector) {
          try {
            let docForSelector = document;
            if (request.isGoogleDocs) {
                let gDocsIframe = document.querySelector(GOOGLE_DOCS_IFRAME_SELECTOR);
                if (gDocsIframe && gDocsIframe.contentDocument) {
                    docForSelector = gDocsIframe.contentDocument;
                }
            }
            targetEl = docForSelector.querySelector(request.targetSelector) || targetEl;
          } catch(e) {
            console.warn("Error finding element by selector:", request.targetSelector, e);
          }
      }

      if (!targetEl || (!document.contains(targetEl) && !(targetEl.ownerDocument && targetEl.ownerDocument.contains(targetEl)))) {
        console.warn(`Target element for job ${request.jobId} (selector: ${request.targetSelector}) not found or no longer valid. Attempting to use last known good target.`);
        targetEl = currentTargetElement;
         if (!targetEl || (!document.contains(targetEl) && !(targetEl.ownerDocument && targetEl.ownerDocument.contains(targetEl)))) {
            console.error(`Fallback target element for job ${request.jobId} also invalid. Aborting character typing.`);
            chrome.runtime.sendMessage({ action: "PING_JOB_STATUS", jobId: request.jobId, error: "target_lost" });
            sendResponse({ typed: false, error: "target_lost" });
            return true;
        }
      }
      
      const success = typeCharacterIntoElement(request.character, targetEl, request.isGoogleDocs);
      sendResponse({ typed: success });
      return true;

    } else if (request.action === "TYPING_FINISHED") {
      isTyping = false;
        console.log(`Content script received TYPING_FINISHED for job ${request.jobId}: ${request.message}`);
        if (request.message && !request.message.toLowerCase().includes("error")) {
        } else if (request.message) {
             createNotification(`Typing issue: ${request.message.substring(0,100)}`, true);
        }
        currentTargetElement = null;
        currentTargetSelector = null;
        currentTargetIsGoogleDocs = false;
        sendResponse({ received: true });
        return true;
    }
  });

  function createNotification(message, isError = false) {
    const existingNotification = document.getElementById('gemini-typer-notification');
    if (existingNotification) {
        existingNotification.remove();
    }

    const notification = document.createElement('div');
    notification.id = 'gemini-typer-notification';
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed; bottom: 20px; right: 20px;
        padding: 12px 20px; background-color: ${isError ? '#f44336' : '#4CAF50'};
        color: white; border-radius: 5px; box-shadow: 0 2px 10px rgba(0,0,0,0.2);
        z-index: 2147483647; font-family: Arial, sans-serif; font-size: 14px;
        opacity: 0; transition: opacity 0.5s ease-in-out;
    `;
    document.body.appendChild(notification);
    
    setTimeout(() => { notification.style.opacity = '1'; }, 10);
    setTimeout(() => {
        notification.style.opacity = '0';
        setTimeout(() => notification.remove(), 500);
    }, isError ? 6000 : 4000);
  }

  console.log("Gemini Slow Typer content script initialized.");
})();
