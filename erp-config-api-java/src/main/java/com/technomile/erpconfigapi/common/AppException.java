package com.technomile.erpconfigapi.common;

import org.springframework.http.HttpStatus;

public class AppException extends RuntimeException {
    private final HttpStatus status;
    private final String errorCode;

    public AppException(HttpStatus status, String errorCode, String detail) {
        super(detail);
        this.status = status;
        this.errorCode = errorCode;
    }

    public HttpStatus getStatus() {
        return status;
    }

    public String getErrorCode() {
        return errorCode;
    }
}
