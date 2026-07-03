package com.example.smarthoop

import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.annotation.CapacitorPlugin

@CapacitorPlugin(name = "VolumeButtons")
class VolumeButtonsPlugin : Plugin() {

    companion object {
        private var instance: VolumeButtonsPlugin? = null

        fun emit(action: String) {
            val plugin = instance ?: return

            val data = JSObject()
            data.put("action", action)

            plugin.notifyListeners("volumeButton", data)
        }
    }

    override fun load() {
        instance = this
    }
}
