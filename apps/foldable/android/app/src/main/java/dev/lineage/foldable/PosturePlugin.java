package dev.lineage.foldable;

import android.graphics.Rect;

import androidx.core.content.ContextCompat;
import androidx.core.util.Consumer;
import androidx.window.java.layout.WindowInfoTrackerCallbackAdapter;
import androidx.window.layout.DisplayFeature;
import androidx.window.layout.FoldingFeature;
import androidx.window.layout.WindowInfoTracker;
import androidx.window.layout.WindowLayoutInfo;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.concurrent.Executor;

/**
 * Reports real foldable posture from Jetpack WindowManager
 * ({@link FoldingFeature}) to the web layer. This is the {@code native-plugin}
 * posture source — it can detect a physical half-fold (book posture), which the
 * web Device Posture API can't see inside the Android System WebView.
 */
@CapacitorPlugin(name = "Posture")
public class PosturePlugin extends Plugin {

    private WindowInfoTrackerCallbackAdapter adapter;
    private Consumer<WindowLayoutInfo> consumer;
    private JSObject latest = flatPayload();

    @Override
    public void load() {
        adapter = new WindowInfoTrackerCallbackAdapter(WindowInfoTracker.getOrCreate(getActivity()));
        Executor executor = ContextCompat.getMainExecutor(getContext());
        consumer = new Consumer<WindowLayoutInfo>() {
            @Override
            public void accept(WindowLayoutInfo info) {
                latest = toPayload(info);
                notifyListeners("postureChange", latest);
            }
        };
        adapter.addWindowLayoutInfoListener(getActivity(), executor, consumer);
    }

    @Override
    protected void handleOnDestroy() {
        if (adapter != null && consumer != null) {
            adapter.removeWindowLayoutInfoListener(consumer);
        }
    }

    @PluginMethod
    public void getPosture(PluginCall call) {
        call.resolve(latest);
    }

    private static JSObject flatPayload() {
        JSObject obj = new JSObject();
        obj.put("type", "flat");
        return obj;
    }

    private JSObject toPayload(WindowLayoutInfo info) {
        FoldingFeature fold = null;
        for (DisplayFeature feature : info.getDisplayFeatures()) {
            if (feature instanceof FoldingFeature) {
                fold = (FoldingFeature) feature;
                break;
            }
        }
        if (fold == null) {
            return flatPayload();
        }

        JSObject obj = new JSObject();
        boolean halfOpened = FoldingFeature.State.HALF_OPENED.equals(fold.getState());
        obj.put("type", halfOpened ? "half-opened" : "flat");
        boolean vertical = FoldingFeature.Orientation.VERTICAL.equals(fold.getOrientation());
        obj.put("orientation", vertical ? "vertical" : "horizontal");
        obj.put("isSeparating", fold.isSeparating());

        Rect bounds = fold.getBounds();
        obj.put("hingeLeft", bounds.left);
        obj.put("hingeTop", bounds.top);
        obj.put("hingeWidth", bounds.width());
        obj.put("hingeHeight", bounds.height());
        return obj;
    }
}
