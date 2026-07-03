package com.example.smarthoop

import android.os.Bundle
import android.view.KeyEvent
import com.getcapacitor.BridgeActivity

class MainActivity : BridgeActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        registerPlugin(VolumeButtonsPlugin::class.java)
        super.onCreate(savedInstanceState)
    }

    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        val keyCode = event.keyCode

        val isVolumeKey =
            keyCode == KeyEvent.KEYCODE_VOLUME_UP ||
            keyCode == KeyEvent.KEYCODE_VOLUME_DOWN

        if (isVolumeKey) {
            if (
                event.action == KeyEvent.ACTION_DOWN &&
                event.repeatCount == 0
            ) {
                val action =
                    if (keyCode == KeyEvent.KEYCODE_VOLUME_UP) "hit" else "miss"

                VolumeButtonsPlugin.emit(action)
            }

            return true
        }

        return super.dispatchKeyEvent(event)
    }
}
