
import { GoogleGenAI, Type } from "@google/genai";
import { ModelMetadata, AISuggestion } from "../types";

export const getAISuggestions = async (metadata: ModelMetadata, lang: 'en' | 'zh' = 'en'): Promise<AISuggestion> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const prompt = `
    I have an FBX 3D model named "${metadata.name}".
    Animations: ${metadata.animations.map(a => a.name).join(', ')}.
    
    Act as a professional lighting director. Suggest a cinematic setup.
    Return exact technical parameters for a Three.js scene. 
    The model is scaled to fit within a 200x200x200 bounding box centered at origin (0,0,0).
    
    Include:
    - Main light position (x, y, z)
    - Exposure value (typical range 0.5 to 2.0)
    - Field of View (FOV) usually 35 to 60.
    - Animation Speed factor (0.5 to 1.5)
    
    IMPORTANT: Provide the "explanation", "cameraAngle", and "lighting" text in ${lang === 'zh' ? 'Chinese' : 'English'}.
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            cameraPosition: {
              type: Type.OBJECT,
              properties: {
                x: { type: Type.NUMBER },
                y: { type: Type.NUMBER },
                z: { type: Type.NUMBER }
              },
              required: ["x", "y", "z"]
            },
            lookAt: {
              type: Type.OBJECT,
              properties: {
                x: { type: Type.NUMBER },
                y: { type: Type.NUMBER },
                z: { type: Type.NUMBER }
              },
              required: ["x", "y", "z"]
            },
            mainLightColor: { type: Type.STRING },
            mainLightIntensity: { type: Type.NUMBER },
            mainLightPosition: {
              type: Type.OBJECT,
              properties: {
                x: { type: Type.NUMBER },
                y: { type: Type.NUMBER },
                z: { type: Type.NUMBER }
              },
              required: ["x", "y", "z"]
            },
            ambientIntensity: { type: Type.NUMBER },
            ambientColor: { type: Type.STRING },
            environmentVibe: { type: Type.STRING, enum: ['studio', 'night', 'sunset', 'neon'] },
            backgroundColor: { type: Type.STRING },
            exposure: { type: Type.NUMBER },
            shadowsEnabled: { type: Type.BOOLEAN },
            animationSpeed: { type: Type.NUMBER },
            fov: { type: Type.NUMBER },
            cameraAngle: { type: Type.STRING },
            lighting: { type: Type.STRING },
            explanation: { type: Type.STRING }
          },
          required: [
            "cameraPosition", "lookAt", "mainLightColor", "mainLightIntensity", 
            "mainLightPosition", "ambientIntensity", "ambientColor", "environmentVibe", 
            "backgroundColor", "exposure", "shadowsEnabled", "animationSpeed", "fov",
            "cameraAngle", "lighting", "explanation"
          ]
        }
      }
    });

    return JSON.parse(response.text.trim()) as AISuggestion;
  } catch (error) {
    console.error("AI Analysis failed:", error);
    return {
      cameraPosition: { x: 250, y: 150, z: 250 },
      lookAt: { x: 0, y: 50, z: 0 },
      mainLightColor: "#ffffff",
      mainLightIntensity: 2.0,
      mainLightPosition: { x: 200, y: 400, z: 200 },
      ambientIntensity: 0.5,
      ambientColor: "#ffffff",
      environmentVibe: 'studio',
      backgroundColor: "#020617",
      exposure: 1.2,
      shadowsEnabled: true,
      animationSpeed: 1.0,
      fov: 45,
      cameraAngle: lang === 'zh' ? "默认轨道视角" : "Default Orbit",
      lighting: lang === 'zh' ? "基础影棚灯光" : "Basic Studio",
      explanation: lang === 'zh' ? "由于分析失败，已恢复至默认设置。" : "Fallback to default settings."
    };
  }
};
