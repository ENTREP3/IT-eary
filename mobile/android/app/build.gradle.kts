import java.util.Properties

/*
 * The release signing credentials, kept out of this file and out of git.
 *
 * key.properties and the keystore beside it are both gitignored. That is
 * not tidiness: anyone holding them can publish an app Android will accept
 * as an update to this one, on every phone that has it installed.
 *
 * Missing is a normal state, not an error. A fresh clone, or a machine
 * that only ever runs debug builds, has no key.properties, and a debug run
 * must not fail because of it. Release builds fall back to the debug key
 * below, and say so.
 */
val keystoreProperties = Properties().apply {
    val f = rootProject.file("key.properties")
    if (f.exists()) f.inputStream().use { load(it) }
}
val hasReleaseKey = keystoreProperties.getProperty("storeFile") != null

plugins {
    id("com.android.application")
    /*
     * Reads google-services.json at build time and turns it into the values
     * the Firebase SDK looks for at runtime. Without it the app starts, fails
     * to find a project, and notifications silently never arrive.
     *
     * Only this plugin is added. The Firebase console also suggests a BoM and
     * firebase-analytics, and neither belongs here: the FlutterFire packages
     * bring their own versions of what they need, and analytics is a product
     * this shop does not use and should not be shipping to customers.
     */
    id("com.google.gms.google-services")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

android {
    namespace = "site.iteary.bencris"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    defaultConfig {
        /*
         * The app's permanent identity on Android. Do not change it again.
         *
         * Reverse of iteary.site, the domain the shop owns. It was
         * ph.edu.nu.iteary.iteary_mobile until the first release — a namespace
         * belonging to the university rather than to the shop, which would
         * have been odd on a customer's phone long after the coursework ended.
         *
         * Changed while nothing had shipped, because that is the only moment
         * it is free. Android treats a different applicationId as a different
         * app: anyone holding the old one would keep it forever, receive no
         * updates, and have to uninstall — losing their order history — to get
         * the new one. It is also what google-services.json is bound to, so
         * changing it after registering Firebase stops push working silently.
         */
        applicationId = "site.iteary.bencris"
        // You can update the following values to match your application needs.
        // For more information, see: https://flutter.dev/to/review-gradle-config.
        minSdk = flutter.minSdkVersion
        targetSdk = flutter.targetSdkVersion
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    signingConfigs {
        if (hasReleaseKey) {
            create("release") {
                storeFile = rootProject.file(keystoreProperties.getProperty("storeFile"))
                storePassword = keystoreProperties.getProperty("storePassword")
                keyAlias = keystoreProperties.getProperty("keyAlias")
                keyPassword = keystoreProperties.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        release {
            /*
             * The real key when it is present, the debug key when it is not.
             *
             * A debug-signed release still installs, which is what makes
             * this trap worth a comment: it looks like it worked. Android
             * will refuse to install any later build signed properly over
             * the top of it, so every diner who took that APK would have to
             * uninstall — losing their order history — to ever update.
             * Anything handed to a customer must be signed with the real
             * key, the first time.
             */
            signingConfig = if (hasReleaseKey) {
                signingConfigs.getByName("release")
            } else {
                logger.warn("No key.properties: signing the release with the DEBUG key. Do not hand this build to anybody.")
                signingConfigs.getByName("debug")
            }
        }
    }
}

kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}

flutter {
    source = "../.."
}
