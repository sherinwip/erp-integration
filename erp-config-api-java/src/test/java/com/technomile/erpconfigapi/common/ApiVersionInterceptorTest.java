package com.technomile.erpconfigapi.common;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import java.lang.reflect.Field;

import static org.junit.jupiter.api.Assertions.*;

class ApiVersionInterceptorTest {

    @Test
    void preHandleShouldRejectWhenHeaderMissing() throws Exception {
        ApiVersionInterceptor interceptor = new ApiVersionInterceptor();
        setField(interceptor, "versionHeader", "X-API-Version");
        setField(interceptor, "responseVersionHeader", "X-API-Version-Used");

        MockHttpServletRequest request = new MockHttpServletRequest();
        MockHttpServletResponse response = new MockHttpServletResponse();

        AppException ex = assertThrows(AppException.class, () -> interceptor.preHandle(request, response, new Object()));

        assertEquals("ValidationError", ex.getErrorCode());
    }

    @Test
    void preHandleShouldSetResponseHeaderAndAttribute() throws Exception {
        ApiVersionInterceptor interceptor = new ApiVersionInterceptor();
        setField(interceptor, "versionHeader", "X-API-Version");
        setField(interceptor, "responseVersionHeader", "X-API-Version-Used");

        MockHttpServletRequest request = new MockHttpServletRequest();
        request.addHeader("X-API-Version", "v2");
        MockHttpServletResponse response = new MockHttpServletResponse();

        boolean out = interceptor.preHandle(request, response, new Object());

        assertTrue(out);
        assertEquals("v2", request.getAttribute(ApiVersionInterceptor.REQ_ATTR_API_VERSION));
        assertEquals("v2", response.getHeader("X-API-Version-Used"));
    }

    private static void setField(Object target, String name, Object value) throws Exception {
        Field field = target.getClass().getDeclaredField(name);
        field.setAccessible(true);
        field.set(target, value);
    }
}
