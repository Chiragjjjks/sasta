package app.sasta.android;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(PlatformSessionPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
