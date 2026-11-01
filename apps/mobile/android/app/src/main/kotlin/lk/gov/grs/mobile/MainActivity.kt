package lk.gov.grs.mobile

import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.Signature
import android.net.Uri
import android.view.WindowManager
import androidx.core.content.FileProvider
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel
import java.io.File
import java.security.MessageDigest

class MainActivity : FlutterActivity() {
    companion object {
        private const val CHANNEL = "lk.gov.grs/updater"
        private const val SECURITY_CHANNEL = "lk.gov.grs/security"
    }

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)

        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, SECURITY_CHANNEL)
                .setMethodCallHandler { call, result ->
                    when (call.method) {
                        "enableSecureScreen" -> {
                            window.setFlags(
                                    WindowManager.LayoutParams.FLAG_SECURE,
                                    WindowManager.LayoutParams.FLAG_SECURE
                            )
                            result.success(true)
                        }
                        "disableSecureScreen" -> {
                            window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
                            result.success(true)
                        }
                        else -> result.notImplemented()
                    }
                }
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, CHANNEL).setMethodCallHandler {
                call,
                result ->
            when (call.method) {
                "installApk" -> {
                    val filePath = call.argument<String>("filePath")
                    if (filePath == null) {
                        result.error("INVALID_PATH", "File path cannot be null", null)
                        return@setMethodCallHandler
                    }
                    val file = File(filePath)
                    if (!file.exists()) {
                        result.error("FILE_NOT_FOUND", "APK file does not exist at $filePath", null)
                        return@setMethodCallHandler
                    }

                    if (!verifyApkCertificate(file)) {
                        result.error(
                                "SIGNATURE_VERIFICATION_FAILED",
                                "APK signing certificate does not match the installed application certificate.",
                                null
                        )
                        return@setMethodCallHandler
                    }

                    try {
                        val intent =
                                Intent(Intent.ACTION_VIEW).apply {
                                    val apkUri: Uri =
                                            FileProvider.getUriForFile(
                                                    context,
                                                    "${context.packageName}.fileProvider",
                                                    file
                                            )
                                    setDataAndType(
                                            apkUri,
                                            "application/vnd.android.package-archive"
                                    )
                                    addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                                }
                        context.startActivity(intent)
                        result.success(true)
                    } catch (e: Exception) {
                        result.error(
                                "INSTALL_ERROR",
                                e.localizedMessage ?: "Installation failed",
                                e.message
                        )
                    }
                }
                else -> result.notImplemented()
            }
        }
    }

    @Suppress("DEPRECATION")
    private fun verifyApkCertificate(apkFile: File): Boolean {
        try {
            val pm = context.packageManager

            // 1. Get current installed app's signatures (API 29+ supports signingInfo)
            val pkgInfo =
                    pm.getPackageInfo(context.packageName, PackageManager.GET_SIGNING_CERTIFICATES)
            val currentSignatures: Array<Signature>? =
                    pkgInfo.signingInfo?.apkContentsSigners ?: pkgInfo.signatures

            if (currentSignatures.isNullOrEmpty()) {
                return false
            }

            // 2. Get archive's signatures
            val archiveInfo =
                    pm.getPackageArchiveInfo(
                            apkFile.absolutePath,
                            PackageManager.GET_SIGNING_CERTIFICATES
                    )
                            ?: return false

            archiveInfo.applicationInfo?.sourceDir = apkFile.absolutePath
            archiveInfo.applicationInfo?.publicSourceDir = apkFile.absolutePath

            var archiveSignatures: Array<Signature>? =
                    archiveInfo.signingInfo?.apkContentsSigners ?: archiveInfo.signatures

            if (archiveSignatures.isNullOrEmpty()) {
                val fallbackArchive =
                        pm.getPackageArchiveInfo(
                                apkFile.absolutePath,
                                PackageManager.GET_SIGNATURES
                        )
                archiveSignatures = fallbackArchive?.signatures
            }

            if (archiveSignatures.isNullOrEmpty()) {
                return false
            }

            val md = MessageDigest.getInstance("SHA-256")
            val currentHashes =
                    currentSignatures
                            .map { sig ->
                                md.reset()
                                md.digest(sig.toByteArray()).joinToString("") { "%02x".format(it) }
                            }
                            .toSet()

            val archiveHashes =
                    archiveSignatures
                            .map { sig ->
                                md.reset()
                                md.digest(sig.toByteArray()).joinToString("") { "%02x".format(it) }
                            }
                            .toSet()

            return currentHashes == archiveHashes
        } catch (e: Exception) {
            return false
        }
    }
}
