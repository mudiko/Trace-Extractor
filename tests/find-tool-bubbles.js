const { extractCursorDiskKV } = require('../src/extractor');

async function findToolBubbles() {
    const data = await extractCursorDiskKV();
    const targetId = 'a528de3d-b5a6-454f-bf73-4d829383ba05';
    
    for (const [composerId, bubbles] of Object.entries(data.bubbles)) {
        if (composerId.startsWith('183bead9')) {
            console.log('CHECKING CONVERSATION:', composerId);
            
            for (const [bubbleId, bubble] of Object.entries(bubbles)) {
                const bubbleStr = JSON.stringify(bubble);
                const hasTargetId = bubbleStr.includes(targetId);
                
                console.log(`\nBubble: ${bubbleId}`);
                console.log('  Contains target ID:', hasTargetId);
                console.log('  Has toolFormerData:', !!bubble.toolFormerData);
                console.log('  Has text:', !!bubble.text);
                console.log('  Has thinking:', !!bubble.thinking);
                
                if (bubble.toolFormerData) {
                    console.log('  Tool data keys:', Object.keys(bubble.toolFormerData));
                    console.log('  Tool name/type:', bubble.toolFormerData.name || bubble.toolFormerData.tool);
                    
                    if (hasTargetId) {
                        console.log('  *** TARGET ID FOUND IN THIS TOOL BUBBLE ***');
                        console.log('  Full tool data:', JSON.stringify(bubble.toolFormerData, null, 2));
                    }
                }
                
                if (hasTargetId && bubble.text) {
                    console.log('  *** TARGET ID FOUND IN TEXT ***');
                    console.log('  Text preview:', bubble.text.substring(0, 200) + '...');
                }
                
                if (hasTargetId && bubble.thinking) {
                    console.log('  *** TARGET ID FOUND IN THINKING ***');
                    console.log('  Thinking preview:', bubble.thinking.text ? bubble.thinking.text.substring(0, 200) + '...' : 'No thinking text');
                }
            }
            break;
        }
    }
}

findToolBubbles();