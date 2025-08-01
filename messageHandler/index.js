// messageHandler/index.js - FitGenius Backend Principal
const { OpenAI } = require("openai");

// Configuration OpenAI (compatible avec Azure)
const openAIClient = new OpenAI({
    apiKey: process.env.AZURE_OPENAI_KEY,
    baseURL: `${process.env.AZURE_OPENAI_ENDPOINT}/openai/deployments/${process.env.GPT35_DEPLOYMENT_NAME}`,
    defaultQuery: { 'api-version': '2024-02-01' },
    defaultHeaders: { 'api-key': process.env.AZURE_OPENAI_KEY }
});

// Configuration Azure OpenAI
const openAIClient = new OpenAIClient(
    process.env.AZURE_OPENAI_ENDPOINT,
    new AzureKeyCredential(process.env.AZURE_OPENAI_KEY)
);

// Configuration Cosmos DB - TEMPORAIREMENT DÉSACTIVÉ
let cosmosClient = null;
let database, usersContainer, interactionsContainer;

// Initialiser Cosmos DB
async function initializeCosmosDB() {
    try {
        // TEMPORAIREMENT DÉSACTIVÉ POUR TESTER
        console.log("⚠️ Cosmos DB temporairement désactivé pour les tests");
        
        // On réactivera plus tard avec:
        // const { CosmosClient } = require("@azure/cosmos");
        // cosmosClient = new CosmosClient(process.env.AZURE_COSMOSDB_URI);
        // database = cosmosClient.database("fitgenius");
        // etc...
        
    } catch (error) {
        console.error("❌ Erreur Cosmos DB:", error);
    }
}

// Initialiser au démarrage
initializeCosmosDB();

// FONCTION PRINCIPALE - Point d'entrée Azure Functions
module.exports = async function (context, req) {
    context.log('🚀 FitGenius - Nouvelle requête reçue');

    try {
        const { method } = req;
        
        // Route de test
        if (method === 'GET') {
            context.res = {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
                body: {
                    status: "✅ FitGenius API is running!",
                    version: "1.0.0",
                    endpoints: {
                        whatsapp: "/api/whatsapp",
                        test: "/api/whatsapp?test=true"
                    }
                }
            };
            return;
        }

        // Gestion des messages WhatsApp/SMS
        if (method === 'POST') {
            const { body } = req;
            
            // Test local
            if (req.query.test) {
                const testResponse = await handleTestMessage(body);
                context.res = {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' },
                    body: testResponse
                };
                return;
            }
            
            // Message WhatsApp réel (Twilio)
            const { Body, From, MediaUrl0 } = body;
            const phoneNumber = From ? From.replace('whatsapp:', '') : 'test-user';
            
            context.log(`📱 Message de: ${phoneNumber}`);
            context.log(`💬 Contenu: ${Body}`);
            context.log(`📸 Image: ${MediaUrl0 ? 'Oui' : 'Non'}`);
            
            // Traiter le message
            const response = await processMessage(phoneNumber, Body, MediaUrl0);
            
            // Réponse pour Twilio
            context.res = {
                status: 200,
                headers: { 'Content-Type': 'text/xml' },
                body: `<?xml version="1.0" encoding="UTF-8"?>
                       <Response>
                           <Message>${response}</Message>
                       </Response>`
            };
        }
        
    } catch (error) {
        context.log.error('❌ Erreur:', error);
        context.res = {
            status: 500,
            body: "Désolé, une erreur s'est produite. Réessayez!"
        };
    }
};

// Traiter un message
async function processMessage(phoneNumber, text, imageUrl) {
    try {
        console.log("🔍 Processing message:", { phoneNumber, text, imageUrl });
        
        // Obtenir ou créer l'utilisateur
        const user = await getOrCreateUser(phoneNumber);
        console.log("👤 User:", user);
        
        // Détecter la langue
        const language = detectLanguage(text);
        console.log("🌐 Language:", language);
        
        // Analyser l'intention
        const intent = await analyzeIntent(text, imageUrl, language);
        console.log("🎯 Intention détectée:", intent);
        
        // Traiter selon l'intention
        switch(intent.type) {
            case 'SIZE_REQUEST':
                return await handleSizeRequest(user, intent.data, language);
                
            case 'UPDATE_PROFILE':
                return await updateUserProfile(user, intent.data, language);
                
            case 'FEEDBACK':
                return await handleFeedback(user, intent.data, language);
                
            default:
                return getWelcomeMessage(language);
        }
        
    } catch (error) {
        console.error('Erreur processMessage:', error);
        return "Désolé, je n'ai pas pu traiter votre demande. Réessayez!";
    }
}

// Détecter la langue (FR/EN)
function detectLanguage(text) {
    if (!text) return 'auto';
    
    const frenchWords = ['bonjour', 'salut', 'taille', 'quelle', 'pour', 'merci', 'svp', 'chemise', 'pantalon'];
    const textLower = text.toLowerCase();
    
    const hasFrench = frenchWords.some(word => textLower.includes(word));
    return hasFrench ? 'fr' : 'en';
}

// Analyser l'intention avec GPT
async function analyzeIntent(text, imageUrl, language) {
    console.log("🔍 Début analyse d'intention pour:", text);
    
    const systemPrompt = language === 'fr' 
        ? `Tu analyses les messages pour FitGenius. Identifie l'intention: SIZE_REQUEST (demande de taille), UPDATE_PROFILE (mise à jour profil), FEEDBACK (retour), OTHER. Pour SIZE_REQUEST, extrais: brand, item_type, url. Réponds en JSON.`
        : `You analyze messages for FitGenius. Identify intent: SIZE_REQUEST (size query), UPDATE_PROFILE (profile update), FEEDBACK (feedback), OTHER. For SIZE_REQUEST, extract: brand, item_type, url. Reply in JSON.`;

    try {
        const messages = [
            { role: "system", content: systemPrompt },
            { role: "user", content: text || "Image sent" }
        ];
        
        console.log("🤖 Appel OpenAI avec deployment:", process.env.GPT35_DEPLOYMENT_NAME);
        console.log("📝 Messages envoyés:", JSON.stringify(messages, null, 2));
        
        const result = await openAIClient.getChatCompletions(
            process.env.GPT35_DEPLOYMENT_NAME,
            messages,
            { temperature: 0.3, maxTokens: 200 }
        );
        
        console.log("✅ Résultat complet OpenAI:", result);
        
        const content = result.choices[0].message.content;
        console.log("📄 Contenu de la réponse:", content);
        
        const parsed = JSON.parse(content);
        console.log("📊 Intent parsé avec succès:", parsed);
        
        // REFORMATER pour correspondre à ce qu'attend le code
        if (parsed.intent === 'SIZE_REQUEST') {
            return {
                type: 'SIZE_REQUEST',
                data: {
                    brand: parsed.brand || 'Gap',
                    item_type: parsed.item_type || 'shirt',
                    size_mentioned: 'M'  // TODO: Améliorer la détection
                }
            };
        }
        
        // Autres types d'intent
        return {
            type: parsed.intent || 'OTHER',
            data: {}
        };
        
    } catch (error) {
        console.error('❌ Erreur analyse intention:', error);
        console.error('❌ Type erreur:', error.constructor.name);
        console.error('❌ Message erreur:', error.message);
        console.error('❌ Stack:', error.stack);
        
        // FALLBACK - Détection manuelle si OpenAI échoue
        console.log("🔄 Utilisation du fallback manuel");
        
        if (!text) {
            return { type: 'OTHER' };
        }
        
        const textLower = text.toLowerCase();
        
        // Détecter si c'est une demande de taille
        const sizeKeywords = ['shirt', 'chemise', 'pants', 'pantalon', 'dress', 'robe', 'jacket', 'veste', 'size', 'taille', 'medium', 'large', 'small'];
        const brandKeywords = ['gap', 'lululemon', 'roots', 'nike', 'adidas', 'zara', 'h&m'];
        
        const hasSize = sizeKeywords.some(word => textLower.includes(word));
        const hasBrand = brandKeywords.some(word => textLower.includes(word));
        
        if (hasSize || hasBrand) {
            // Extraire la marque
            let brand = 'Gap'; // défaut
            for (const b of brandKeywords) {
                if (textLower.includes(b)) {
                    brand = b.charAt(0).toUpperCase() + b.slice(1);
                    break;
                }
            }
            
            // Extraire le type de vêtement
            let itemType = 'shirt';
            if (textLower.includes('pants') || textLower.includes('pantalon')) itemType = 'pants';
            if (textLower.includes('dress') || textLower.includes('robe')) itemType = 'dress';
            if (textLower.includes('jacket') || textLower.includes('veste')) itemType = 'jacket';
            
            // Détecter la taille
            let sizeMentioned = 'M';
            if (textLower.includes(' s ') || textLower.includes('small') || textLower.includes('petit')) sizeMentioned = 'S';
            if (textLower.includes(' m ') || textLower.includes('medium') || textLower.includes('moyen')) sizeMentioned = 'M';
            if (textLower.includes(' l ') || textLower.includes('large') || textLower.includes('grand')) sizeMentioned = 'L';
            
            const fallbackResult = {
                type: 'SIZE_REQUEST',
                data: {
                    brand: brand,
                    item_type: itemType,
                    size_mentioned: sizeMentioned
                }
            };
            
            console.log("✅ Résultat fallback:", fallbackResult);
            return fallbackResult;
        }
        
        return { type: 'OTHER' };
    }
}

// Gérer une demande de taille
async function handleSizeRequest(user, data, language) {
    try {
        console.log("📏 Traitement demande de taille:", data);
        
        // Pour le MVP, on simule une recommandation
        const brands = {
            'gap': { 
                'S': { fr: 'Prenez M - Gap taille petit', en: 'Take M - Gap runs small' },
                'M': { fr: 'Prenez L - Gap taille petit', en: 'Take L - Gap runs small' },
                'L': { fr: 'Prenez XL - Gap taille petit', en: 'Take XL - Gap runs small' }
            },
            'lululemon': { 
                'S': { fr: 'Prenez 4 ou 6', en: 'Take size 4 or 6' },
                'M': { fr: 'Prenez 8 ou 10', en: 'Take size 8 or 10' },
                'L': { fr: 'Prenez 12 ou 14', en: 'Take size 12 or 14' }
            },
            'roots': { 
                'S': { fr: 'Prenez S - Roots taille normalement', en: 'Take S - Roots runs true to size' },
                'M': { fr: 'Prenez M - Roots taille normalement', en: 'Take M - Roots runs true to size' },
                'L': { fr: 'Prenez L - Roots taille normalement', en: 'Take L - Roots runs true to size' }
            }
        };
        
        const brandLower = (data.brand || 'gap').toLowerCase();
        const sizeMentioned = data.size_mentioned || detectSizeInText(data.item_type || '');
        
        console.log("🏷️ Marque:", brandLower, "Taille:", sizeMentioned);
        
        const brandRecs = brands[brandLower] || brands['gap'];
        const sizeRec = brandRecs[sizeMentioned] || brandRecs['M'];
        const recommendation = sizeRec[language] || sizeRec['en'];
        
        // Logger l'interaction
        await logInteraction(user, data, recommendation);
        
        // Formater la réponse
        if (language === 'fr') {
            return `🎯 **${data.brand || 'Marque'}**\n\n` +
                   `✅ **Recommandation: ${recommendation}**\n` +
                   `📊 Confiance: 85%\n\n` +
                   `💡 Conseil: ${brandLower === 'gap' ? 'Gap taille généralement petit' : 'Vérifiez le guide des tailles'}\n\n` +
                   `Cette recommandation vous aide? Répondez:\n` +
                   `• PARFAIT ✅\n` +
                   `• TROP GRAND 📏\n` +
                   `• TROP PETIT 📐`;
        } else {
            return `🎯 **${data.brand || 'Brand'}**\n\n` +
                   `✅ **Recommendation: ${recommendation}**\n` +
                   `📊 Confidence: 85%\n\n` +
                   `💡 Tip: ${brandLower === 'gap' ? 'Gap usually runs small' : 'Check the size guide'}\n\n` +
                   `Was this helpful? Reply:\n` +
                   `• PERFECT ✅\n` +
                   `• TOO BIG 📏\n` +
                   `• TOO SMALL 📐`;
        }
        
    } catch (error) {
        console.error('Erreur handleSizeRequest:', error);
        return language === 'fr' 
            ? "Je n'ai pas pu analyser ce produit. Envoyez une photo ou un lien!"
            : "I couldn't analyze this product. Send a photo or link!";
    }
}

// Détecter la taille mentionnée
function detectSizeInText(text) {
    const textUpper = text.toUpperCase();
    if (textUpper.includes('SMALL') || textUpper.includes('PETIT')) return 'S';
    if (textUpper.includes('MEDIUM') || textUpper.includes('MOYEN')) return 'M';
    if (textUpper.includes('LARGE') || textUpper.includes('GRAND')) return 'L';
    if (textUpper.includes(' S ') || textUpper.includes(' S,')) return 'S';
    if (textUpper.includes(' M ') || textUpper.includes(' M,')) return 'M';
    if (textUpper.includes(' L ') || textUpper.includes(' L,')) return 'L';
    return 'M'; // défaut
}

// Obtenir ou créer un utilisateur
async function getOrCreateUser(phoneNumber) {
    // VERSION TEMPORAIRE SANS DB
    console.log("📱 User temporaire créé pour:", phoneNumber);
    return {
        id: phoneNumber,
        phoneNumber: phoneNumber,
        createdAt: new Date().toISOString(),
        measurements: {},
        purchaseHistory: [],
        preferences: {},
        language: 'auto',
        temporary: true
    };
}

// Mettre à jour le profil utilisateur
async function updateUserProfile(user, data, language) {
    // TEMPORAIRE - Sans DB
    console.log("📝 Mise à jour profil:", data);
    
    if (language === 'fr') {
        return "✅ Profil mis à jour! Vos préférences ont été enregistrées.";
    } else {
        return "✅ Profile updated! Your preferences have been saved.";
    }
}

// Gérer le feedback
async function handleFeedback(user, data, language) {
    // TEMPORAIRE - Sans DB
    console.log("💬 Feedback reçu:", data);
    
    if (language === 'fr') {
        return "Merci pour votre retour! Cela nous aide à améliorer nos recommandations. 🙏";
    } else {
        return "Thanks for your feedback! This helps us improve our recommendations. 🙏";
    }
}

// Logger une interaction
async function logInteraction(user, data, recommendation) {
    // TEMPORAIREMENT DÉSACTIVÉ
    console.log("📊 Interaction:", { user: user.id, data, recommendation });
    return;
}

// Messages de bienvenue bilingues
function getWelcomeMessage(language = 'auto') {
    const messages = {
        fr: `👋 Bienvenue sur FitGenius!\n\n` +
            `Je suis votre assistant taille personnel 🤖\n\n` +
            `Envoyez-moi:\n` +
            `📸 Une photo d'un vêtement\n` +
            `🔗 Un lien de produit\n` +
            `✏️ Ou écrivez "Gap chemise medium"\n\n` +
            `Je vous dirai quelle taille commander! 🎯`,
        
        en: `👋 Welcome to FitGenius!\n\n` +
            `I'm your personal size assistant 🤖\n\n` +
            `Send me:\n` +
            `📸 A photo of any clothing\n` +
            `🔗 A product link\n` +
            `✏️ Or type "Gap shirt medium"\n\n` +
            `I'll tell you which size to order! 🎯`,
            
        auto: `👋 Welcome to FitGenius! / Bienvenue!\n\n` +
              `🇨🇦 I'm your personal size assistant\n` +
              `🇨🇦 Je suis votre assistant taille\n\n` +
              `Send me / Envoyez-moi:\n` +
              `📸 A photo / Une photo\n` +
              `🔗 A link / Un lien\n` +
              `✏️ Or type / Ou écrivez\n\n` +
              `I'll find your size! / Je trouve votre taille! 🎯`
    };
    
    return messages[language] || messages.auto;
}

// Gérer les tests locaux
async function handleTestMessage(body) {
    const { message, phoneNumber = 'test-user' } = body;
    const response = await processMessage(phoneNumber, message, null);
    
    return {
        request: body,
        response: response,
        timestamp: new Date().toISOString()
    };

}
