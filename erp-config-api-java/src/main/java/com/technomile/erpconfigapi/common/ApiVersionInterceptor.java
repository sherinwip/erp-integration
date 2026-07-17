package com.technomile.erpconfigapi.common;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

@Component
public class ApiVersionInterceptor implements HandlerInterceptor {

    public static final String REQ_ATTR_API_VERSION = "apiVersion";

    @Value("${app.api.version-header:X-API-Version}")
    private String versionHeader;

    @Value("${app.api.version-response-header:X-API-Version-Used}")
    private String responseVersionHeader;

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        // Commented out for now, as we are not enforcing API versioning at this time. This can be re-enabled in the future if needed.
        
        // String version = request.getHeader(versionHeader);
        // if (version == null || version.isBlank()) {
        //     throw new AppException(HttpStatus.BAD_REQUEST, "ValidationError",
        //             "Missing required request header: " + versionHeader);
        // }
        // request.setAttribute(REQ_ATTR_API_VERSION, version);
        // response.setHeader(responseVersionHeader, version);
        return true;
    }
}
