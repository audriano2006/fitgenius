module.exports = async function (context, req) {
    context.log('FitGenius API appelée');
    
    try {
        // Test basique
        if (req.method === 'GET') {
            context.res = {
                status: 200,
                body: {
                    status: "✅ FitGenius API is running!",
                    version: "1.0.0",
                    timestamp: new Date(),
                    azure: "Connected"
                }
            };
            return;
        }
        
        // AJOUTEZ CE BLOC POUR POST
        if (req.method === 'POST') {
            const { message } = req.body || {};
            context.log('Message reçu:', message);
            
            // Détection simple de marques
            if (message && message.toLowerCase().includes('gap')) {
                context.res = {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' },
                    body: {
                        response: "🎯 **Gap**\n\n✅ **Recommendation: Take L - Gap runs small**\n📊 Confidence: 85%\n\n💡 Tip: Gap usually runs small\n\nWas this helpful?"
                    }
                };
                return;
            }
            
            if (message && message.toLowerCase().includes('lululemon')) {
                context.res = {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' },
                    body: {
                        response: "🎯 **Lululemon**\n\n✅ **Recommendation: Take size 8 or 10**\n📊 Confidence: 90%\n\n💡 Tip: Lululemon sizes are unique"
                    }
                };
                return;
            }
            
            // Message par défaut
            context.res = {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
                body: {
                    response: "👋 Welcome to FitGenius!\n\nSend me a message like:\n- 'Gap shirt medium'\n- 'Lululemon pants size 8'"
                }
            };
            return;
        }
        
    } catch (error) {
        context.log.error('Erreur:', error);
        context.res = {
            status: 500,
            body: "Erreur: " + error.message
        };
    }
};
