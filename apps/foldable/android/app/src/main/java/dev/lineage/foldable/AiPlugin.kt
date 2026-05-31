package dev.lineage.foldable

import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.google.mlkit.genai.common.FeatureStatus
import com.google.mlkit.genai.prompt.Generation
import com.google.mlkit.genai.prompt.GenerativeModel
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

/**
 * On-device generative AI via the ML Kit GenAI Prompt API (Gemini Nano through
 * AICore). Bridges the Kotlin coroutine/Flow API to Capacitor:
 * - `getStatus()` — feature availability (unavailable | downloadable | downloading | available)
 * - `download()` — fetch the model, emitting `aiDownloadProgress` events
 * - `generate({ prompt })` — run a prompt, resolve `{ text }`
 *
 * Android-only and device-gated (Pixel 8/9-class with AICore). When the model
 * is unavailable the web layer hides the AI features.
 */
@CapacitorPlugin(name = "Ai")
class AiPlugin : Plugin() {
    private val scope = CoroutineScope(Dispatchers.Main + SupervisorJob())
    private var model: GenerativeModel? = null

    private fun model(): GenerativeModel {
        return model ?: Generation.getClient().also { model = it }
    }

    @PluginMethod
    fun getStatus(call: PluginCall) {
        scope.launch {
            try {
                call.resolve(JSObject().put("status", statusName(model().checkStatus())))
            } catch (e: Exception) {
                call.reject(e.message ?: "checkStatus failed", e)
            }
        }
    }

    @PluginMethod
    fun download(call: PluginCall) {
        scope.launch {
            try {
                model().download().collect { status ->
                    notifyListeners(
                        "aiDownloadProgress",
                        JSObject().put("state", status.javaClass.simpleName),
                    )
                }
                call.resolve(JSObject().put("status", "available"))
            } catch (e: Exception) {
                call.reject(e.message ?: "download failed", e)
            }
        }
    }

    @PluginMethod
    fun generate(call: PluginCall) {
        val prompt = call.getString("prompt")
        if (prompt == null) {
            call.reject("prompt is required")
            return
        }
        scope.launch {
            try {
                val response = model().generateContent(prompt)
                val text = response.candidates.firstOrNull()?.text ?: ""
                call.resolve(JSObject().put("text", text))
            } catch (e: Exception) {
                call.reject(e.message ?: "generate failed", e)
            }
        }
    }

    override fun handleOnDestroy() {
        model?.close()
        model = null
    }

    private fun statusName(status: Int): String = when (status) {
        FeatureStatus.AVAILABLE -> "available"
        FeatureStatus.DOWNLOADABLE -> "downloadable"
        FeatureStatus.DOWNLOADING -> "downloading"
        else -> "unavailable"
    }
}
