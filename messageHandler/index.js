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
        
        // Pour POST
        context.res = {
            status: 200,
            body: "POST reçu - OpenAI temporairement désactivé"
        };
        
    } catch (error) {
        context.log.error('Erreur:', error);
        context.res = {
            status: 500,
            body: "Erreur: " + error.message
        };
    }
};
