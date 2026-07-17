package com.technomile.erpconfigapi.common;

import com.fasterxml.jackson.databind.exc.InvalidFormatException;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;

import static org.junit.jupiter.api.Assertions.assertEquals;

class GlobalExceptionHandlerTest {

    @Test
    void handleDataIntegrityViolationExceptionShouldMapPipelineRoutingConstraintToConflict() {
        GlobalExceptionHandler handler = new GlobalExceptionHandler();

        DataIntegrityViolationException ex = new DataIntegrityViolationException(
                "duplicate",
                new RuntimeException("duplicate key value violates unique constraint \"idx_pipeline_routing\"")
        );

        ResponseEntity<ApiError> response = handler.handleDataIntegrityViolationException(ex);

        assertEquals(HttpStatus.CONFLICT, response.getStatusCode());
        assertEquals("Conflict", response.getBody().error());
        assertEquals(
                "A pipeline route with the same (client_id, source_system, object_type, event_type) already exists",
                response.getBody().detail()
        );
    }

    @Test
    void handleMessageNotReadableExceptionShouldReturnValidationErrorForInvalidLong() {
        GlobalExceptionHandler handler = new GlobalExceptionHandler();

        InvalidFormatException cause = InvalidFormatException.from(
                null,
                "Cannot deserialize value",
                "{{demoStepPk}}",
                Long.class
        );
        cause.prependPath(new Object(), "step_pk");
        HttpMessageNotReadableException ex = new HttpMessageNotReadableException("JSON parse error", cause, null);

        ResponseEntity<ApiError> response = handler.handleMessageNotReadableException(ex);

        assertEquals(HttpStatus.UNPROCESSABLE_ENTITY, response.getStatusCode());
        assertEquals("ValidationError", response.getBody().error());
        assertEquals(
                "step_pk must be a valid number. Received '{{demoStepPk}}'. If this is a placeholder, resolve it before calling the API.",
                response.getBody().detail()
        );
    }
}
