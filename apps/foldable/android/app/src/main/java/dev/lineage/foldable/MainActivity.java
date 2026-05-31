package dev.lineage.foldable;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(PosturePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
