package com.technomile.erpconfigapi.entity;

import jakarta.persistence.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.OffsetDateTime;

@Entity
@Table(name = "pipeline")
public class Pipeline {
    @Id
    @Column(name = "pipeline_id", length = 100)
    private String pipelineId;

    @Column(name = "client_id", nullable = false, length = 50)
    private String clientId;

    @Column(name = "version", nullable = false, length = 20)
    private String version;

    @Column(name = "source_system", nullable = false, length = 50)
    private String sourceSystem;

    @Column(name = "object_type", nullable = false, length = 100)
    private String objectType;

    @Column(name = "event_type", nullable = false, length = 50)
    private String eventType;

    @Column(name = "pattern_id", nullable = false, length = 10)
    private String patternId;

    @Column(name = "status", nullable = false, length = 20)
    private String status;

    @Column(name = "retry_max_attempts", nullable = false)
    private Integer retryMaxAttempts;

    @Column(name = "retry_backoff", nullable = false, length = 20)
    private String retryBackoff;

    @Column(name = "retry_backoff_base_ms", nullable = false)
    private Integer retryBackoffBaseMs;

    @Column(name = "retry_on_status_codes", nullable = false, length = 100)
    private String retryOnStatusCodes;

    @Column(name = "created_at", nullable = false)
    @CreationTimestamp
    private OffsetDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    @UpdateTimestamp
    private OffsetDateTime updatedAt;

    public String getPipelineId() { return pipelineId; }
    public void setPipelineId(String pipelineId) { this.pipelineId = pipelineId; }
    public String getClientId() { return clientId; }
    public void setClientId(String clientId) { this.clientId = clientId; }
    public String getVersion() { return version; }
    public void setVersion(String version) { this.version = version; }
    public String getSourceSystem() { return sourceSystem; }
    public void setSourceSystem(String sourceSystem) { this.sourceSystem = sourceSystem; }
    public String getObjectType() { return objectType; }
    public void setObjectType(String objectType) { this.objectType = objectType; }
    public String getEventType() { return eventType; }
    public void setEventType(String eventType) { this.eventType = eventType; }
    public String getPatternId() { return patternId; }
    public void setPatternId(String patternId) { this.patternId = patternId; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public Integer getRetryMaxAttempts() { return retryMaxAttempts; }
    public void setRetryMaxAttempts(Integer retryMaxAttempts) { this.retryMaxAttempts = retryMaxAttempts; }
    public String getRetryBackoff() { return retryBackoff; }
    public void setRetryBackoff(String retryBackoff) { this.retryBackoff = retryBackoff; }
    public Integer getRetryBackoffBaseMs() { return retryBackoffBaseMs; }
    public void setRetryBackoffBaseMs(Integer retryBackoffBaseMs) { this.retryBackoffBaseMs = retryBackoffBaseMs; }
    public String getRetryOnStatusCodes() { return retryOnStatusCodes; }
    public void setRetryOnStatusCodes(String retryOnStatusCodes) { this.retryOnStatusCodes = retryOnStatusCodes; }
    public OffsetDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(OffsetDateTime createdAt) { this.createdAt = createdAt; }
    public OffsetDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(OffsetDateTime updatedAt) { this.updatedAt = updatedAt; }
}
