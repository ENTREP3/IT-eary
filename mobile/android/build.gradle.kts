allprojects {
    repositories {
        google()
        mavenCentral()
    }

    /*
     * One desugaring library for the whole build.
     *
     * The app asks for 2.1.5 and flutter_local_notifications asks for 2.1.4,
     * so a build pulls both. They do the same job, and shipping two copies of
     * a backported standard library is how a method ends up resolving to the
     * wrong one. Pinned to the newer of the two.
     */
    configurations.all {
        resolutionStrategy {
            force("com.android.tools:desugar_jdk_libs:2.1.5")
        }
    }
}

val newBuildDir: Directory =
    rootProject.layout.buildDirectory
        .dir("../../build")
        .get()
rootProject.layout.buildDirectory.value(newBuildDir)

subprojects {
    val newSubprojectBuildDir: Directory = newBuildDir.dir(project.name)
    project.layout.buildDirectory.value(newSubprojectBuildDir)
}
subprojects {
    project.evaluationDependsOn(":app")
}

tasks.register<Delete>("clean") {
    delete(rootProject.layout.buildDirectory)
}
